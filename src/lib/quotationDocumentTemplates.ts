import {
  CUSTOMER_DOCUMENT_REQUEST_TEMPLATES,
  type CustomerDocumentRequestTemplate,
  type DocumentRequestType,
} from "@/lib/customerDocumentRequests";
import {
  QUOTATION_DELIVERY_DOCUMENT_TEMPLATES,
  WARRANTY_DISCLOSURE_TEMPLATES,
  type QuotationDeliveryDocumentTemplate,
  type QuotationDeliveryDocumentType,
  type WarrantyDisclosureTemplate,
} from "@/lib/quotationDeliveryDocuments";

export const QUOTATION_DOCUMENT_TEMPLATE_SETTING_KEY = "quotation_document_templates";

export type DocumentRequestTemplateConfig = CustomerDocumentRequestTemplate;

export type DeliveryDocumentTemplateConfig = QuotationDeliveryDocumentTemplate & {
  deliveryType: QuotationDeliveryDocumentType;
};
export type WarrantyDisclosureTemplateConfig = WarrantyDisclosureTemplate;

export type QuotationDocumentTemplateCatalog = {
  requests: DocumentRequestTemplateConfig[];
  deliveries: DeliveryDocumentTemplateConfig[];
  warranties: WarrantyDisclosureTemplateConfig[];
};

const defaultCatalog: QuotationDocumentTemplateCatalog = {
  requests: CUSTOMER_DOCUMENT_REQUEST_TEMPLATES,
  deliveries: QUOTATION_DELIVERY_DOCUMENT_TEMPLATES,
  warranties: WARRANTY_DISCLOSURE_TEMPLATES,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRequestType(value: unknown): DocumentRequestType {
  return value === "LOCATION" || value === "CONTACT_INFO" ? value : "FILE";
}

function cloneDefaults(): QuotationDocumentTemplateCatalog {
  return {
    requests: defaultCatalog.requests.map((template) => ({ ...template })),
    deliveries: defaultCatalog.deliveries.map((template) => ({ ...template })),
    warranties: defaultCatalog.warranties.map((template) => ({ ...template })),
  };
}

export function parseQuotationDocumentTemplateCatalog(value: unknown): QuotationDocumentTemplateCatalog {
  const parsed = typeof value === "string"
    ? (() => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return null;
      }
    })()
    : value;
  const record = asRecord(parsed);
  if (!record) return cloneDefaults();

  const defaults = cloneDefaults();
  const requests = Array.isArray(record.requests)
    ? record.requests.flatMap((item): DocumentRequestTemplateConfig[] => {
      const template = asRecord(item);
      const id = asText(template?.id);
      const documentName = asText(template?.documentName);
      if (!id || !documentName) return [];
      return [{
        id,
        documentName,
        descriptionHint: asText(template?.descriptionHint) || null,
        requestType: asRequestType(template?.requestType),
        isRequired: template?.isRequired !== false,
      }];
    })
    : defaults.requests;

  const deliveries = Array.isArray(record.deliveries)
    ? record.deliveries.flatMap((item): DeliveryDocumentTemplateConfig[] => {
      const template = asRecord(item);
      const deliveryType = asText(template?.deliveryType) as QuotationDeliveryDocumentType;
      const title = asText(template?.title);
      const isBuiltIn = defaults.deliveries.some((defaultTemplate) => defaultTemplate.deliveryType === deliveryType);
      if ((!isBuiltIn && !deliveryType.startsWith("CUSTOM_")) || !title) return [];
      return [{
        deliveryType,
        title,
        description: asText(template?.description),
        required: template?.required !== false,
      }];
    })
    : defaults.deliveries;

  const warranties = Array.isArray(record.warranties)
    ? record.warranties.flatMap((item): WarrantyDisclosureTemplateConfig[] => {
      const template = asRecord(item);
      const id = asText(template?.id);
      const equipment = asText(template?.equipment);
      const coverage = asText(template?.coverage);
      if (!id || !equipment || !coverage) return [];
      return [{ id, equipment, coverage, isVisibleToClient: template?.isVisibleToClient !== false }];
    })
    : defaults.warranties;

  return {
    requests,
    deliveries: deliveries.length > 0 ? deliveries : defaults.deliveries,
    warranties: warranties.length > 0 ? warranties : defaults.warranties,
  };
}
