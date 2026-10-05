-- pg_cron tick (PLAN.md §7.4). Once a minute, call the secret-protected
-- job-runner endpoint. The runner claims due jobs with SKIP LOCKED.
--
-- Requires the pg_cron and pg_net extensions (enable in Supabase dashboard
-- → Database → Extensions) and two Vault secrets:
--   select vault.create_secret('https://your-app.vercel.app', 'app_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
--
-- Wrapped so local `supabase db reset` succeeds without the extensions.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;

    perform cron.unschedule('makeithappen-tick')
      where exists (select 1 from cron.job where jobname = 'makeithappen-tick');

    perform cron.schedule(
      'makeithappen-tick',
      '* * * * *',
      $job$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/run-jobs',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
          ),
          body    := '{}'::jsonb,
          timeout_milliseconds := 50000
        );
      $job$
    );
  else
    raise notice 'pg_cron/pg_net not available — skipping cron schedule. Call POST /api/cron/run-jobs from an external scheduler.';
  end if;
end $$;
