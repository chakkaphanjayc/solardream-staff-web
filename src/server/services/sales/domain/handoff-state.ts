import type { HandoffState,HandoffTransitionContext } from "@/types/sales-v2";
const transitions:Record<HandoffState,readonly HandoffState[]>={PENDING:["READY","BLOCKED"],BLOCKED:["PENDING","READY"],READY:["CONSUMED","BLOCKED"],CONSUMED:[]};
export function canTransitionHandoff(from:HandoffState,to:HandoffState,c:HandoffTransitionContext={}):boolean{return transitions[from].includes(to)&&(to!=="READY"||!!c.proposalAccepted&&!!c.paymentReady&&!!c.configurationReady);}
export function assertHandoffTransition(from:HandoffState,to:HandoffState,c?:HandoffTransitionContext):void{if(!canTransitionHandoff(from,to,c))throw new Error(`Invalid handoff transition: ${from} -> ${to}`);}
