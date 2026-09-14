"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type QuotationDocumentRequestSnapshot = {
  id: string;
  quotationId: string;
  documentName: string;
  descriptionHint: string | null;
  requestType: string;
  isRequired: boolean;
  status: string;
  fileUrl: string | null;
  metadata: unknown;
  updatedAt: string;
};

export type QuotationSnapshot = {
  id: string;
  status: string;
  dispatchStatus: string;
  magicTokenSlug: string;
  erpnextQuotationId: string | null;
  documentRequests: QuotationDocumentRequestSnapshot[];
  updatedAt: string;
};

type UpdateQuotationStatusInput = {
  id: string;
  status?: string;
  dispatchStatus?: string;
};

type UpdateQuotationStatusResponse = {
  success: boolean;
  quotation: QuotationSnapshot;
};

const quotationKey = (id: string) => ["quotation", id] as const;

async function fetchQuotation(id: string): Promise<QuotationSnapshot> {
  const response = await fetch(`/api/quotations/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json() as { quotation?: QuotationSnapshot; error?: string };

  if (!response.ok || !payload.quotation) {
    throw new Error(payload.error || "Unable to load quotation.");
  }

  return payload.quotation;
}

async function updateQuotationStatus(input: UpdateQuotationStatusInput): Promise<UpdateQuotationStatusResponse> {
  const response = await fetch(`/api/quotations/${encodeURIComponent(input.id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      status: input.status,
      dispatchStatus: input.dispatchStatus,
    }),
  });
  const payload = await response.json() as UpdateQuotationStatusResponse | { error?: string };

  if (!response.ok || !("quotation" in payload)) {
    const errorMessage = "error" in payload ? payload.error : undefined;
    throw new Error(errorMessage || "Unable to update quotation.");
  }

  return payload;
}

export function useQuotation(id: string | null | undefined) {
  return useQuery({
    queryKey: quotationKey(id || "missing"),
    queryFn: () => fetchQuotation(id || ""),
    enabled: Boolean(id),
  });
}

export function useUpdateQuotationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateQuotationStatus,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: quotationKey(input.id) });
      const previous = queryClient.getQueryData<QuotationSnapshot>(quotationKey(input.id));

      if (previous) {
        queryClient.setQueryData<QuotationSnapshot>(quotationKey(input.id), {
          ...previous,
          status: input.status ?? previous.status,
          dispatchStatus: input.dispatchStatus ?? previous.dispatchStatus,
        });
      }

      return { previous };
    },
    onError: (_error, input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(quotationKey(input.id), context.previous);
      }
    },
    onSuccess: (payload) => {
      queryClient.setQueryData(quotationKey(payload.quotation.id), payload.quotation);
      void queryClient.invalidateQueries({ queryKey: ["quotations"] });
    },
  });
}
