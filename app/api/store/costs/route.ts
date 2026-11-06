import { NextRequest, NextResponse } from "next/server";

import { changeStoreCost, readStoreCosts } from "@/application/organization/store-costs";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function accessResponse(status: number) {
  const message = status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Not found";
  return NextResponse.json({ message }, { status });
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const companyId = params.get("companyId") || "";
  const storeAccountId = params.get("storeAccountId") || "";
  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  const product = params.get("product")?.trim() || undefined;
  const historyItemId = params.get("history") === "true" ? params.get("itemId") || undefined : undefined;
  if (!UUID.test(companyId) || !UUID.test(storeAccountId) || (from && !validDate(from)) || (to && !validDate(to)) ||
    (product && product.length > 200) || (params.get("history") === "true" && (!historyItemId || !UUID.test(historyItemId)))) {
    return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  }
  try {
    const result = await readStoreCosts({ companyId, from, historyItemId, product, storeAccountId, to });
    return result.ok ? NextResponse.json({ rows: result.rows }) : accessResponse(result.status);
  } catch {
    return NextResponse.json({ message: "Store costs unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  }
  const row = typeof body.row === "object" && body.row !== null ? body.row as Record<string, unknown> : {};
  const specification = row.specification ?? "";
  if (!UUID.test(String(body.companyId || "")) || !UUID.test(String(body.storeAccountId || "")) ||
    !UUID.test(String(body.itemId || "")) || !Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 1 ||
    !validDate(row.effectiveOn) || typeof row.productName !== "string" || !row.productName.trim() || row.productName.length > 200 ||
    typeof specification !== "string" || specification.length > 200 || typeof row.unit !== "string" ||
    !row.unit.trim() || row.unit.length > 40 || !Number.isInteger(row.costKrw) || Number(row.costKrw) < 0 || Number(row.costKrw) > 1_000_000_000) {
    return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  }
  try {
    const result = await changeStoreCost({
      companyId: String(body.companyId), expectedRevision: Number(body.expectedRevision), itemId: String(body.itemId),
      row: { costKrw: Number(row.costKrw), effectiveOn: row.effectiveOn, productName: row.productName.trim(),
        specification, unit: row.unit.trim() },
      storeAccountId: String(body.storeAccountId)
    });
    return result.ok ? NextResponse.json(result.result) : accessResponse(result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("store_cost_revision_conflict")) return NextResponse.json({ message: "Revision conflict" }, { status: 409 });
    if (message.includes("store_cost_item_not_found")) return NextResponse.json({ message: "Not found" }, { status: 404 });
    return NextResponse.json({ message: "Store costs unavailable" }, { status: 503 });
  }
}
