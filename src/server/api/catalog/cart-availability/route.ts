import { NextRequest, NextResponse } from "next/server";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import { getCatalogProductsByIds } from "@/lib/erpnextCatalog";


const MAX_CART_LOOKUP_IDS = 100;
const MAX_PRODUCT_ID_LENGTH = 128;
const MAX_CART_AVAILABILITY_BODY_BYTES = 32 * 1024;

function normalizeProductIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  const ids = value
    .filter((item: unknown): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= MAX_PRODUCT_ID_LENGTH);

  return Array.from(new Set(ids)).slice(0, MAX_CART_LOOKUP_IDS);
}

export async function POST(req: NextRequest) {
  try {
    if (isRequestContentLengthExceeded(req.headers, MAX_CART_AVAILABILITY_BODY_BYTES)) {
      return NextResponse.json(
        { success: false, error: "Cart availability request is too large." },
        { status: 413 },
      );
    }

    const body = await req.json().catch(() => ({} as { ids?: unknown }));
    const ids = normalizeProductIds(body.ids);

    if (ids.length === 0) {
      return NextResponse.json({ success: true, products: [] });
    }

    const productsList = await getCatalogProductsByIds(ids);

    return NextResponse.json({
      success: true,
      products: productsList.map((product) => ({
        id: product.id,
        brand: product.brand,
        model: product.model,
        price: product.price,
        imageUrl: product.imageUrl,
        isActive: product.isActive,
        stock: product.stock,
        status: product.isActive ? "ACTIVE" : "ARCHIVED",
      })),
      missingIds: ids.filter((id: string) => !productsList.some((product) => product.id === id)),
    });
  } catch (error) {
    console.error("[Cart Availability] Failed to resolve product availability:", error);
    return NextResponse.json(
      { success: false, error: "Failed to resolve product availability." },
      { status: 500 }
    );
  }
}
