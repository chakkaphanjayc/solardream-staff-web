// Document template generator for compliance forms
// Produces HTML-based document layouts for various document codes

interface DocumentGeneratorParams {
  documentCode: number;
  documentTitle: string;
  customerName: string;
  formData: Record<string, unknown>;
  signatureImage?: string;
  timestamp: string;
}

function escapeHtml(value: unknown, fallback = "N/A"): string {
  const text = value === undefined || value === null || value === "" ? fallback : String(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getField(formData: Record<string, unknown>, key: string, fallback = "N/A"): string {
  return escapeHtml(formData[key], fallback);
}

function isAllowedSignatureImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;

    const hostname = url.hostname.toLowerCase();
    const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const configuredSupabaseHost = configuredSupabaseUrl
      ? new URL(configuredSupabaseUrl).hostname.toLowerCase()
      : "";

    return (
      Boolean(configuredSupabaseHost && hostname === configuredSupabaseHost) ||
      hostname === "lh3.googleusercontent.com" ||
      hostname.endsWith(".googleusercontent.com")
    );
  } catch {
    return false;
  }
}

function getTrustedImageSrc(value: string | undefined): string | null {
  if (!value) return null;
  const rasterDataImagePattern = /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return isAllowedSignatureImageUrl(url.toString()) ? escapeHtml(url.toString()) : null;
  } catch {
    return rasterDataImagePattern.test(trimmed) ? escapeHtml(trimmed) : null;
  }
}

export function generateDocumentHTML(params: DocumentGeneratorParams): string {
  const {
    documentCode,
    documentTitle,
    customerName,
    formData,
    signatureImage,
    timestamp,
  } = params;
  const trustedSignatureSrc = getTrustedImageSrc(signatureImage);

  const baseHTML = `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
	      <title>${escapeHtml(documentTitle)}</title>
  <style>
    * { margin: 0; padding: 0; }
    body {
      font-family: 'Arial', sans-serif;
      line-height: 1.6;
      color: #333;
    }
    .container {
      max-width: 210mm;
      height: 297mm;
      margin: 0 auto;
      padding: 20mm;
      background: white;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #B7D1EA;
      padding-bottom: 20px;
    }
    .header h1 {
      font-size: 24px;
      color: #0F172A;
      margin-bottom: 10px;
    }
    .header p {
      font-size: 12px;
      color: #666;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 14px;
      font-weight: bold;
      color: #0F172A;
      border-bottom: 1px solid #ddd;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .field {
      margin-bottom: 12px;
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 10px;
    }
    .field-label {
      font-weight: bold;
      font-size: 12px;
      color: #333;
    }
    .field-value {
      font-size: 12px;
      color: #666;
      padding: 4px 8px;
      border-bottom: 1px solid #ccc;
    }
    .signature-section {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .signature-block {
      text-align: center;
      flex: 1;
    }
    .signature-image {
      width: 150px;
      height: 60px;
      border: 1px solid #ddd;
      margin-bottom: 10px;
    }
    .signature-line {
      border-top: 1px solid #333;
      margin-bottom: 5px;
      width: 150px;
    }
    .signature-name {
      font-size: 11px;
      font-weight: bold;
    }
    .footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #ddd;
      font-size: 10px;
      color: #999;
      text-align: right;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    table th, table td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
      font-size: 11px;
    }
    table th {
      background-color: #f5f5f5;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
	      <h1>${escapeHtml(documentTitle)}</h1>
	      <p>Document Code: ${documentCode}</p>
	      <p>Customer: ${escapeHtml(customerName)}</p>
    </div>

    ${getDocumentContent(documentCode, formData)}

    <div class="signature-section">
      <div class="signature-block">
	        ${trustedSignatureSrc ? `<img src="${trustedSignatureSrc}" alt="Signature" class="signature-image">` : '<div class="signature-image"></div>'}
        <div class="signature-line"></div>
        <div class="signature-name">Authorized Signature</div>
        <div style="font-size: 10px; color: #999;">${new Date(timestamp).toLocaleDateString()}</div>
      </div>
    </div>

    <div class="footer">
      Generated: ${new Date(timestamp).toLocaleString()}
    </div>
  </div>
</body>
</html>
  `;

  return baseHTML;
}

function getDocumentContent(
  documentCode: number,
  formData: Record<string, unknown>
): string {
  switch (documentCode) {
    case 9: // Purchase Order
      return `
    <div class="section">
      <div class="section-title">Purchase Order Details</div>
      <div class="field">
        <div class="field-label">Order Number</div>
	        <div class="field-value">${getField(formData, "orderNumber")}</div>
      </div>
      <div class="field">
        <div class="field-label">Order Date</div>
	        <div class="field-value">${getField(formData, "orderDate")}</div>
      </div>
      <div class="field">
        <div class="field-label">Total Amount</div>
	        <div class="field-value">฿${getField(formData, "totalAmount", "0.00")}</div>
      </div>
      <div class="field">
        <div class="field-label">Supplier</div>
	        <div class="field-value">${getField(formData, "supplier")}</div>
      </div>
    </div>
      `;

    case 11: // JSA Form
      return `
    <div class="section">
      <div class="section-title">Job Safety Analysis (JSA)</div>
      <div class="field">
        <div class="field-label">Hazards Identified</div>
	        <div class="field-value" style="border: none; white-space: pre-wrap;">${getField(formData, "hazard_identification")}</div>
      </div>
      <div class="field">
        <div class="field-label">Safety Measures</div>
	        <div class="field-value" style="border: none; white-space: pre-wrap;">${getField(formData, "safety_measures")}</div>
      </div>
      <div class="field">
        <div class="field-label">Emergency Contact</div>
	        <div class="field-value">${getField(formData, "emergency_contacts")}</div>
      </div>
      <div class="field">
        <div class="field-label">Safety Approved</div>
	        <div class="field-value">${formData.approved ? "✓ Yes" : "✗ No"}</div>
      </div>
    </div>
      `;

    case 12: // Technical Survey
      return `
    <div class="section">
      <div class="section-title">Technical Site Survey Report</div>
      <div class="field">
        <div class="field-label">Roof Type</div>
	        <div class="field-value">${getField(formData, "roof_type")}</div>
      </div>
      <div class="field">
        <div class="field-label">Azimuth Angle</div>
	        <div class="field-value">${getField(formData, "azimuth_angle")}°</div>
      </div>
      <div class="field">
        <div class="field-label">Shading Evaluation</div>
	        <div class="field-value" style="border: none; white-space: pre-wrap;">${getField(formData, "shading_eval")}</div>
      </div>
      <div class="field">
        <div class="field-label">Inverter Location</div>
	        <div class="field-value" style="border: none; white-space: pre-wrap;">${getField(formData, "inverter_location")}</div>
      </div>
    </div>
      `;

    default:
      return `
    <div class="section">
      <div class="section-title">Document Details</div>
	      <p>Document Code ${documentCode}: ${Object.entries(formData)
	        .map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(value)}`)
	        .join("<br>")}</p>
    </div>
      `;
  }
}
