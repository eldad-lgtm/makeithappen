import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { loadTripPage } from "../load";
import { TripNav } from "../TripNav";
import { SettingsForm } from "./SettingsForm";

export default async function TripSettingsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { agg, me } = await loadTripPage(id);
  if (!me.isAdmin) notFound();

  return (
    <Shell userName={me.name}>
      <TripNav trip={agg.trip} isAdmin active="settings" />
      <div className="card">
        <SettingsForm trip={agg.trip} />
      </div>
    </Shell>
  );
}
