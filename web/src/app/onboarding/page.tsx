import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { NameForm } from "./NameForm";

export default async function OnboardingPage() {
  const s = await getSessionUser();
  if (!s) redirect("/login");

  const suggested = s.appUser && s.appUser.display_name !== "New member" ? s.appUser.display_name : "";
  const fromInviter = s.appUser?.name_source === "inviter";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">MakeItHappen</p>
      <h1 className="mt-2 text-2xl font-bold">What should we call you?</h1>
      <p className="mt-2 text-sm text-muted">
        {fromInviter
          ? `A friend invited you as “${suggested}”. Keep it or fix it — this is the name your group sees.`
          : "This is the name your friends will see in the group."}
      </p>
      <div className="card mt-6">
        <NameForm suggested={suggested} timezone={s.appUser?.timezone ?? "UTC"} />
      </div>
    </main>
  );
}
