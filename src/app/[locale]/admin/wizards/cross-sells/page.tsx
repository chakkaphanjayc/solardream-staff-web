import { getCrossSellRuleBuilderData } from "@/app/actions/crossSell";
import CrossSellRulesClient from "./CrossSellRulesClient";


export default async function CrossSellRulesPage() {
  const data = await getCrossSellRuleBuilderData();

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <CrossSellRulesClient
        initialRules={data.rules}
        products={data.products}
        questions={data.questions}
      />
    </div>
  );
}
