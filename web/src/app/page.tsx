import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/trips");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">MakeItHappen</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight">
        &ldquo;We should totally do Athens.&rdquo;
        <br />
        <span className="text-muted">This time it actually happens.</span>
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted">
        You start the trip. The engine asks everyone the right question in WhatsApp, chases the
        ghosts (affectionately), and hands the group a locked date instead of a dead chat. Your
        friends never install anything.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login" className="btn-primary">
          Start a trip
        </Link>
        <Link href="/legal/privacy" className="btn-secondary">
          How we handle phone numbers
        </Link>
      </div>
    </main>
  );
}
