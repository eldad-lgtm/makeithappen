import { Shell } from "@/components/Shell";
import { maskPhone } from "@/core/phone";
import { requireUser } from "@/lib/auth/session";
import { TIMEZONES } from "@/lib/timezones";
import { deleteAccount, setOptOut, updateProfile } from "./actions";

export default async function SettingsPage() {
  const s = await requireUser();
  const u = s.appUser;
  return (
    <Shell userName={u.display_name}>
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-sm text-muted">Signed in as {maskPhone(u.phone_e164)}</p>

      <form action={updateProfile} className="card mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="name">Display name</label>
          <input id="name" name="name" defaultValue={u.display_name} minLength={2} maxLength={40} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="timezone">Timezone</label>
          <select id="timezone" name="timezone" defaultValue={u.timezone} className="input">
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Quiet hours are 22:00–08:00 your time. We never message inside them.</p>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary">Save</button>
        </div>
      </form>

      <section className="card mt-6">
        <h2 className="font-semibold">Messaging</h2>
        <p className="mt-1 text-sm text-muted">
          {u.messaging_opted_out_at
            ? "You're opted out. We won't message this number about any trip."
            : "You'll get WhatsApp messages about trips you're invited to. Opting out applies to every trip, permanently, until you opt back in."}
        </p>
        <form action={setOptOut} className="mt-3">
          <input type="hidden" name="opt_out" value={u.messaging_opted_out_at ? "0" : "1"} />
          <button className={u.messaging_opted_out_at ? "btn-primary" : "btn-secondary"}>
            {u.messaging_opted_out_at ? "Opt back in" : "Opt out of all messages"}
          </button>
        </form>
      </section>

      <section className="card mt-6 border-red-200">
        <h2 className="font-semibold">Delete account</h2>
        <p className="mt-1 text-sm text-muted">Removes your profile, votes and memberships everywhere. Trips you created stay with their other admins.</p>
        <form action={deleteAccount} className="mt-3">
          <button className="btn-danger">Delete my account</button>
        </form>
      </section>
    </Shell>
  );
}
