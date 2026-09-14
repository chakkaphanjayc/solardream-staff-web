"use client";

import { useEffect } from "react";
import { trackProductEvent } from "@/lib/productAnalytics";

export default function ProposalViewTracker({
  quotationId,
  grandTotal,
}: {
  quotationId: string;
  grandTotal: number | null;
}) {
  useEffect(() => {
    void trackProductEvent("proposal_viewed", {
      quotation_id: quotationId,
      grand_total: grandTotal,
    });
  }, [grandTotal, quotationId]);

  return null;
}
