import { requireStaff } from "@/lib/auth-guard";
import { getDeliveryProjectsAndTasksAction } from "@/app/actions/deliveryTasks";
import { db } from "@/db";
import { users } from "@/db/schema";
import DeliveryDispatchBoardClient from "./DeliveryDispatchBoardClient";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AdminDeliveryPage({ params }: PageProps) {
  await requireStaff();
  const { locale } = await params;

  const result = await getDeliveryProjectsAndTasksAction();
  const techUsers = await db.query.users.findMany({
    orderBy: [users.fullName],
  });

  const formattedUsers = techUsers.map((u) => ({
    id: u.id,
    name: u.fullName || u.name || "Technician",
    email: u.email,
    role: u.role || "ENGINEER",
  }));

  return (
    <DeliveryDispatchBoardClient
      locale={locale}
      initialProjects={result.projects || []}
      initialTasks={result.tasks || []}
      technicians={formattedUsers}
    />
  );
}
