import { redirect } from "next/navigation";

export const instant = false;

type SalesThreadPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function SalesThreadPage({ params }: SalesThreadPageProps) {
  const { locale } = await params;
  redirect(`/${locale}/admin/quotations?view=threads`);
}
