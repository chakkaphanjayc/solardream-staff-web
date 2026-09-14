export const SALES_FEATURE_FLAG_NAMES=["SALES_V2","SALES_V2_PIPELINE","SALES_V2_DEALS","SALES_V2_SOLUTION","SALES_V2_QUOTE_BUILDER","SALES_V2_PROPOSAL_PORTAL","SALES_V2_SIGNATURE","SALES_V2_PAYMENT","SALES_V2_HANDOFF"] as const;
export type SalesFeatureFlag=(typeof SALES_FEATURE_FLAG_NAMES)[number];
export function isSalesFeatureEnabled(flag:SalesFeatureFlag,env:NodeJS.ProcessEnv=process.env):boolean{return env[flag]?.trim().toLowerCase()==="true";}
export function getSalesFeatureFlags(env:NodeJS.ProcessEnv=process.env):Record<SalesFeatureFlag,boolean>{return Object.fromEntries(SALES_FEATURE_FLAG_NAMES.map(flag=>[flag,isSalesFeatureEnabled(flag,env)])) as Record<SalesFeatureFlag,boolean>;}
