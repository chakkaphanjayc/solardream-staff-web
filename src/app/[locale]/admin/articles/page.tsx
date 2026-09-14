import { adminGetArticles } from "@/app/actions/articles";
import AdminArticlesClient from "./AdminArticlesClient";

export const metadata = {
  title: "Article CMS - Admin Console",
  description: "Manage news and knowledge base articles.",
};

export default async function AdminArticlesPage() {
  const articles = await adminGetArticles();

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-gray-100 tracking-tight uppercase">
          News & Knowledge Base CMS
        </h1>
        <p className="text-sm text-gray-400 mt-2 font-medium">
          Create, edit, and publish official articles and solar setup guides.
        </p>
      </div>

      <AdminArticlesClient initialArticles={articles} />
    </div>
  );
}
