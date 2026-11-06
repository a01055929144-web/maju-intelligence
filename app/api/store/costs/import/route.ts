import { NextRequest, NextResponse } from "next/server";

import { applyStoreCostImport, previewStoreCostImport } from "@/application/organization/store-cost-import";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function accessResponse(status: number) {
  const message = status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Not found";
  return NextResponse.json({ message }, { status });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid request" }, { status: 400 }); }
  const companyId = String(body.companyId || "");
  const storeAccountId = String(body.storeAccountId || "");
  if (!UUID.test(companyId) || !UUID.test(storeAccountId) || !["preview", "apply"].includes(String(body.mode))) {
    return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  }
  const input = { companyId, fileName: body.fileName, importId: body.importId, rows: body.rows, storeAccountId };
  try {
    if (body.mode === "preview") {
      const result = await previewStoreCostImport(input);
      return result.ok ? NextResponse.json(result.preview) : accessResponse(result.status);
    }
    const result = await applyStoreCostImport({ ...input, confirmationHash: body.confirmationHash });
    return result.ok ? NextResponse.json(result.result) : accessResponse(result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "store_cost_preview_changed") return NextResponse.json({ message: "Preview changed" }, { status: 409 });
    if (message.startsWith("invalid_store_cost") || message.includes("입력해 주세요") || message.includes("확인해 주세요")) {
      return NextResponse.json({ message: "Invalid import" }, { status: 400 });
    }
    return NextResponse.json({ message: "Store cost import unavailable" }, { status: 503 });
  }
}
