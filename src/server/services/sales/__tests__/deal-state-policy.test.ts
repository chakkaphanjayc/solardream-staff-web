import assert from "node:assert/strict";
import { DEAL_STATES, DEAL_TRANSITIONS, DealDomainError, assertDealTransition, type DealState } from "../deal-state-policy";
const full = {
 hasCustomer:true, hasSite:true, qualificationCompleted:true,
 quotation:{official:true,current:true,issued:true,expired:false},
 acceptance:{attributable:true,currentQuotation:true}, payment:{verified:true,policySatisfied:true},
 handoff:{reference:"project-1",acceptanceValid:true,paymentSatisfied:true},
};
let assertions=0;
for (const from of DEAL_STATES) for (const to of DEAL_STATES) {
 const allowed=(DEAL_TRANSITIONS[from] as readonly DealState[]).includes(to);
 try { assertDealTransition(from,to,full); assert.equal(allowed,true,`${from}->${to} unexpectedly permitted`); }
 catch (error) { assert.equal(allowed,false,`${from}->${to} unexpectedly forbidden: ${String(error)}`); assert.ok(error instanceof DealDomainError); assert.equal(error.code,"INVALID_TRANSITION"); }
 assertions++;
}
const predicates: Array<[DealState,DealState,object]> = [
 ["QUALIFYING","QUALIFIED",{...full,hasCustomer:false}],
 ["QUALIFYING","QUALIFIED",{...full,hasSite:false}],
 ["QUALIFYING","QUALIFIED",{...full,qualificationCompleted:false}],
 ["SOLUTION_DESIGN","QUOTATION_ISSUED",{...full,quotation:{...full.quotation,official:false}}],
 ["SOLUTION_DESIGN","QUOTATION_ISSUED",{...full,quotation:{...full.quotation,current:false}}],
 ["SOLUTION_DESIGN","QUOTATION_ISSUED",{...full,quotation:{...full.quotation,issued:false}}],
 ["SOLUTION_DESIGN","QUOTATION_ISSUED",{...full,quotation:{...full.quotation,expired:true}}],
 ["QUOTATION_ISSUED","ACCEPTED",{...full,acceptance:{...full.acceptance,currentQuotation:false}}],
 ["QUOTATION_ISSUED","ACCEPTED",{...full,acceptance:{...full.acceptance,attributable:false}}],
 ["PAYMENT_PENDING","PAID",{...full,payment:{...full.payment,verified:false}}],
 ["PAYMENT_PENDING","PAID",{...full,payment:{...full.payment,policySatisfied:false}}],
 ["HANDOFF_READY","HANDED_OFF",{...full,handoff:{...full.handoff,reference:""}}],
 ["HANDOFF_READY","HANDED_OFF",{...full,handoff:{...full.handoff,acceptanceValid:false}}],
 ["HANDOFF_READY","HANDED_OFF",{...full,handoff:{...full.handoff,paymentSatisfied:false}}],
];
for (const [from,to,context] of predicates) assert.throws(()=>assertDealTransition(from,to,context), (e:unknown)=>e instanceof DealDomainError&&e.code==="PREDICATE_FAILED");
process.stdout.write(`Deal state policy: ${assertions} state pairs and ${predicates.length} predicate failures passed.\n`);
