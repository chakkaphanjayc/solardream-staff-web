import { google } from 'googleapis';

type SheetCell = string | number | boolean | null | undefined;
type SheetRow = SheetCell[];
type SheetRows = SheetRow[];
type JsonRecord = Record<string, unknown>;
type SheetBatchUpdate = {
  range: string;
  values: string[][];
};

export interface ParsedItem {
  id: string;
  brand: string;
  model: string;
  price: number;
  image_url: string | null;
  tech_specs: JsonRecord;
  rowIndex: number;
}

export interface SyncResult {
  tab: string;
  success: boolean;
  upsertedCount: number;
  error?: string;
  summary?: {
    newProducts: unknown[];
    updatedProducts: unknown[];
    deletedProducts: unknown[];
  };
}

/**
 * Sanitizes and parses raw price strings into clean Floats/Numbers.
 */
export function sanitizePrice(rawPrice: unknown): number {
  if (rawPrice === undefined || rawPrice === null) return 0;
  // Strip any whitespace, commas, or currency symbols (like ฿, $)
  const cleaned = String(rawPrice).replace(/[\s,฿$]/g, '');
  const price = parseFloat(cleaned);
  return isNaN(price) ? 0 : price;
}

/**
 * Generates a deterministic slug-like ID based on brand and model.
 */
export function generateDeterministicId(brand: string, model: string): string {
  const combined = `${brand}-${model}`;
  return combined
    .toLowerCase()
    .trim()
    .replace(/[\s/\\(),.฿$]+/g, '-') // Replace spaces and special symbols with -
    .replace(/-+/g, '-')             // Replace multiple hyphens
    .replace(/^-+|-+$/g, '');        // Trim hyphens from ends
}

/**
 * Parses rows from a Google Sheet tab dynamically based on headers in Row 1.
 */
export function parseSheetRows(rows: SheetRows | null | undefined, tabName: string): ParsedItem[] {
  if (!rows || rows.length < 2) {
    console.warn(`[Google Sheets] Empty or invalid data for tab: ${tabName}`);
    return [];
  }

  // Row 1 Extraction: Convert all headers to lowercase strings
  const headers = rows[0].map(h => String(h || '').trim().toLowerCase());

  // Define candidate mappings for required fields to be robust
  const idIndex = headers.findIndex(h => h === 'id' || h === 'key' || h === 'rowid' || h === 'row id');
  const brandIndex = headers.findIndex(h => h === 'brand' || h === 'brandname' || h === 'manufacturer');
  const modelIndex = headers.findIndex(h => h === 'model' || h === 'modelname' || h === 'name');
  const priceIndex = headers.findIndex(h => h === 'price' || h === 'price_thb' || h === 'cost' || h === 'rate');
  const imageUrlIndex = headers.findIndex(h => h === 'image_url' || h === 'imageurl' || h === 'image' || h === 'img' || h === 'thumbnail');

  if (brandIndex === -1 || modelIndex === -1 || priceIndex === -1) {
    throw new Error(
      `Sheet tab "${tabName}" is missing one of the required columns (brand, model, price). Found headers: ${headers.join(', ')}`
    );
  }

  const items: ParsedItem[] = [];
  const seenIds = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const brand = row[brandIndex] ? String(row[brandIndex]).trim() : '';
    const model = row[modelIndex] ? String(row[modelIndex]).trim() : '';
    
    // Determine tab-specific prefix for missing IDs
    let prefix = '';
    const lowerTab = tabName.toLowerCase();
    if (lowerTab.includes('panel') || tabName.includes('แผง') || lowerTab.includes('solarcell')) {
      prefix = 'panel_';
    } else if (lowerTab.includes('inverter') || tabName.includes('อินเวอร์เตอร์')) {
      prefix = 'inverter_';
    } else if (lowerTab.includes('racking') || lowerTab.includes('structure') || tabName.includes('โครงสร้าง') || lowerTab.includes('mounting')) {
      prefix = 'racking_';
    }

    // Fallback deterministic ID if id column is missing or empty
    const idFromSheet = idIndex !== -1 && row[idIndex] ? String(row[idIndex]).trim() : "";
    if (!idFromSheet && (!brand || !model)) {
      continue; // Skip empty rows or rows without brand and model
    }
    const id = idFromSheet || `${prefix}${generateDeterministicId(brand, model)}`;

    // De-duplicate rows in this payload using the unique ID
    if (id) {
      if (seenIds.has(id)) {
        console.warn(`[Google Sheets] Duplicate ID "${id}" found in tab "${tabName}". Skipping duplicate row.`);
        continue;
      }
      seenIds.add(id);
    }

    const price = sanitizePrice(row[priceIndex]);
    const imageUrl = imageUrlIndex !== -1 && row[imageUrlIndex] ? String(row[imageUrlIndex]).trim() : null;

    // Compile dynamic specifications (JSONB)
    const techSpecs: JsonRecord = {};
    headers.forEach((header, colIdx) => {
      // Any column header that does NOT match the 5 required fields above must be bundled into techSpecs
      if (
        colIdx !== idIndex &&
        colIdx !== brandIndex &&
        colIdx !== modelIndex &&
        colIdx !== priceIndex &&
        colIdx !== imageUrlIndex
      ) {
        const rawVal = row[colIdx];
        if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
          const valStr = String(rawVal).trim();
          // Check for basic types: boolean, number, string
          if (valStr.toLowerCase() === 'true') {
            techSpecs[header] = true;
          } else if (valStr.toLowerCase() === 'false') {
            techSpecs[header] = false;
          } else if (!isNaN(Number(valStr)) && valStr !== '') {
            techSpecs[header] = Number(valStr);
          } else {
            techSpecs[header] = valStr;
          }
        }
      }
    });

    items.push({
      id,
      brand,
      model,
      price,
      image_url: imageUrl,
      tech_specs: techSpecs,
      rowIndex: i,
    });
  }

  return items;
}

/**
 * Fetches data from all sheets inside the spreadsheet using batchGet.
 * Leverages Google Service Account credentials with robust escaping and pre-flight validation.
 */
export async function fetchAllTabsData(
  spreadsheetId: string
): Promise<Record<string, SheetRows>> {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  // 1. Credentials Guard Checklist
  if (!clientEmail || !privateKey) {
    console.error("Error: Setup missing for Cloud Google Credentials in .env");
    throw new Error("Error: Setup missing for Cloud Google Credentials in .env");
  }

  // 2. Initialize JWT auth client using the constructor arguments signature
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  
  // 3. Fetch spreadsheet metadata to discover all sheet/tab names and row counts
  let sheetTitles: string[] = [];
  let sheetRanges: string[] = [];
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetMetadata = spreadsheet.data.sheets || [];
    sheetTitles = sheetMetadata
      .map(s => s.properties?.title || "")
      .filter(Boolean) as string[];

    sheetRanges = sheetMetadata
      .filter(s => !!s.properties?.title)
      .map((s) => {
        const title = s.properties!.title as string;
        const escapedTitle = title.replace(/'/g, "''");
        return `'${escapedTitle}'!A1:Z`;
      });
  } catch (err: unknown) {
    console.error("[Google Sheets API] Failed to fetch spreadsheet metadata:", err);
    throw err;
  }

  if (sheetRanges.length === 0) {
    return {};
  }

  // 4. Batch range query execution for all sheets
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: sheetRanges,
  });

  const valueRanges = response.data.valueRanges || [];
  const result: Record<string, SheetRows> = {};

  valueRanges.forEach((valueRange, index) => {
    const sheetName = sheetTitles[index] || `sheet_${index}`;
    const values = (valueRange?.values || []) as SheetRows;
    console.log(`[Google Sheets] Successfully parsed tab "${sheetName}": Found ${values.length} raw entries.`);
    result[sheetName] = values;
  });

  // Ensure every discovered sheet name is present in the returned object
  sheetTitles.forEach(title => {
    if (!(title in result)) {
      result[title] = [];
    }
  });

  return result;
}

/**
 * Parses rows from a Google Sheet tab into generic key-value objects.
 * Ideal for displaying arbitrary spreadsheet tabs in the UI.
 */
export function parseGenericSheetRows(rows: SheetRows | null | undefined): JsonRecord[] {
  if (!rows || rows.length === 0) return [];
  
  // Row 1 Extraction: Treat Row 1 as headers
  const headers = rows[0].map(h => String(h || '').trim());
  const items: JsonRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Check if row has any non-empty cells to avoid parsing empty rows
    const hasData = row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '');
    if (!hasData) continue;

    const item: JsonRecord = {};
    headers.forEach((header, colIdx) => {
      if (header) {
        const rawVal = row[colIdx];
        item[header] = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
      }
    });
    items.push(item);
  }

  return items;
}

/**
 * Writes back generated IDs and status columns back to Google Sheets.
 */
export async function updateSheetProducts(
  spreadsheetId: string,
  tabName: string,
  rows: SheetRows,
  updates: { rowIndex: number; id: string; isActive: boolean }[]
): Promise<void> {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  if (!clientEmail || !privateKey) {
    throw new Error("Error: Setup missing for Cloud Google Credentials in .env");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  if (!rows || rows.length === 0) return;
  const headers = rows[0].map(h => String(h || '').trim().toLowerCase());

  let idColIndex = headers.findIndex(h => h === 'id' || h === 'key' || h === 'rowid' || h === 'row id');
  let statusColIndex = headers.findIndex(h => h === 'status' || h === 'is_active' || h === 'isactive');

  const data: SheetBatchUpdate[] = [];
  let nextColIndex = headers.length;

  let needIdHeader = false;
  if (idColIndex === -1) {
    idColIndex = nextColIndex;
    nextColIndex++;
    needIdHeader = true;
  }

  let needStatusHeader = false;
  if (statusColIndex === -1) {
    statusColIndex = nextColIndex;
    nextColIndex++;
    needStatusHeader = true;
  }

  // Add headers to sheet if they were not there
  if (needIdHeader) {
    data.push({
      range: `${tabName}!${getColumnLetter(idColIndex)}1`,
      values: [['id']]
    });
  }
  if (needStatusHeader) {
    data.push({
      range: `${tabName}!${getColumnLetter(statusColIndex)}1`,
      values: [['status']]
    });
  }

  // Add row updates
  for (const item of updates) {
    const rowNum = item.rowIndex + 1; // Google Sheet row index (1-based, Row 1 is header, Row 2 is index 1, etc.)
    
    data.push({
      range: `${tabName}!${getColumnLetter(idColIndex)}${rowNum}`,
      values: [[item.id]]
    });
    data.push({
      range: `${tabName}!${getColumnLetter(statusColIndex)}${rowNum}`,
      values: [[item.isActive ? 'active' : 'inactive']]
    });
  }

  try {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data
      }
    });
    console.log(`[Google Sheets] Successfully wrote back ${updates.length} product updates to tab "${tabName}".`);
  } catch (err: unknown) {
    console.error("[Google Sheets API] Failed to write back product updates to sheet:", err);
    // Don't throw, let database sync succeed even if sheet write fails
  }
}

export function getColumnLetter(colIndex: number): string {
  let letter = '';
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}
