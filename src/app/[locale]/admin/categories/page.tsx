import { connection } from "next/server";
import { getRecommendationCategories } from "@/app/actions/recommendationCategories";
import RecommendationCategoriesClient from "./RecommendationCategoriesClient";


export default async function AdminCategoriesPage() {
  await connection();

  const result = await getRecommendationCategories();

  return (
    <RecommendationCategoriesClient
      initialCategories={result.success ? result.recommendationCategories || [] : []}
      initialError={result.error || ""}
    />
  );
}
