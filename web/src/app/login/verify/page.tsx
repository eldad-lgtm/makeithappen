import { redirect } from "next/navigation";
import { maskPhone } from "@/core/phone";
import { VerifyForm } from "./VerifyForm";

export default async function VerifyPage(props: { searchParams: Promise<{ phone?: string }> }) {
  const { phone } = await props.searchParams;
  if (!phone) redirect("/login");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">MakeItHappen</p>
      <h1 className="mt-2 text-2xl font-bold">Enter the code</h1>
      <p className="mt-2 text-sm text-muted">We sent a 6-digit code to {maskPhone(phone)}.</p>
      <div className="card mt-6">
        <VerifyForm phone={phone} />
      </div>
    </main>
  );
}
