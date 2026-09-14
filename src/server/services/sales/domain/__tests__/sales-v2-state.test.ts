import assert from "node:assert/strict";
import { canTransitionDeal } from "../deal-state";
import { canTransitionProposal } from "../proposal-state";
import { canTransitionPayment } from "../payment-state";
import { canTransitionHandoff } from "../handoff-state";
assert.equal(canTransitionDeal("QUALIFYING","QUALIFIED",{hasQualification:true}),true);assert.equal(canTransitionDeal("QUALIFYING","QUALIFIED"),false);assert.equal(canTransitionDeal("QUOTATION_ISSUED","ACCEPTED",{hasAcceptedProposal:true}),true);assert.equal(canTransitionDeal("LOST","NEW"),false);assert.equal(canTransitionProposal("DRAFT","ISSUED",{hasRevision:true}),true);assert.equal(canTransitionProposal("ISSUED","ACCEPTED"),false);assert.equal(canTransitionPayment("PENDING","PAID",{paidAmount:100,totalAmount:100}),true);assert.equal(canTransitionPayment("PAID","PENDING"),false);assert.equal(canTransitionHandoff("PENDING","READY",{proposalAccepted:true,paymentReady:true,configurationReady:true}),true);assert.equal(canTransitionHandoff("CONSUMED","READY"),false);console.log("Sales V2 state-machine tests passed");
