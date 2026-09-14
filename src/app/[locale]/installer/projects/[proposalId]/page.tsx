import { notFound } from "next/navigation";

import FieldProjectTaskClient from "./FieldProjectTaskClient";
import { resolveInstallationProjectActor } from "@/lib/installationAccess";
import { loadInstallationSnapshot } from "@/lib/installationWorkflow";
import type { ClientInstallationSnapshot } from "@/components/proposals/portalTypes";


export default async function FieldProjectTaskPage({ params }: { params: Promise<{ locale: string; proposalId: string }> }) {
  const { locale, proposalId } = await params;
  const access = await resolveInstallationProjectActor(proposalId);
  if (!access) notFound();
  const installation = await loadInstallationSnapshot(proposalId, {
    userId: access.actor.userId,
    mode: access.mode,
    role: access.actor.role,
  });
  if (!installation) notFound();
  return <FieldProjectTaskClient locale={locale} proposalId={proposalId} initialInstallation={installation as unknown as NonNullable<ClientInstallationSnapshot>} />;
}
