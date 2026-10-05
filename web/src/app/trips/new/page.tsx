import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth/session";
import { NewTripForm } from "./NewTripForm";

export default async function NewTripPage() {
  const s = await requireUser();
  return (
    <Shell userName={s.appUser.display_name}>
      <h1 className="text-2xl font-bold">Create a trip</h1>
      <p className="mt-1 text-sm text-muted">Two minutes here saves two years in the group chat.</p>
      <div className="card mt-6">
        <NewTripForm />
      </div>
    </Shell>
  );
}
