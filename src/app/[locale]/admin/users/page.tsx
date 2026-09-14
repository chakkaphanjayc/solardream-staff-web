import { db } from "@/db";
import { requireAdmin } from "@/lib/auth-guard";
import AdminUsersClient from "./AdminUsersClient";


export default async function AdminUsersPage() {
  await requireAdmin();
  const usersList = await db.query.users.findMany({
    orderBy: (users, { desc }) => desc(users.createdAt)
  });

  return <AdminUsersClient initialUsers={usersList as any} />;
}
