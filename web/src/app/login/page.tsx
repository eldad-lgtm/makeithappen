import { PhoneForm } from "./PhoneForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">MakeItHappen</p>
      <h1 className="mt-2 text-2xl font-bold">Sign in with your phone</h1>
      <p className="mt-2 text-sm text-muted">
        We&rsquo;ll text you a 6-digit code. No password. If a friend already invited you to a trip, this
        number is how we recognise you.
      </p>
      <div className="card mt-6">
        <PhoneForm />
      </div>
    </main>
  );
}
