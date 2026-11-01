import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "../../../../../lib/auth";
import { areHoldModulesEnabled } from "../../../../../lib/feature-modules";
import { customerItemsImportEnabled, customerItemsFileImportEnabled, customerItemReferences, writeCustomerItems, writeCustomerItemFile } from "../../../../../lib/customer-items-import";
import { importCustomerItems } from "../../../../../application/customer/import-customer-items";
import { CustomerItemImportError } from "../../../../../domains/customer/customer-item-import";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!customerItemsFileImportEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  try {
    const scope = await getRequestAuthScope(request);
    if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    if (!areHoldModulesEnabled(scope.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
    if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "가져오기 권한이 없습니다." }, { status: 403 });
    return NextResponse.json(await customerItemReferences(scope.companyId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof CustomerItemImportError ? error.message : "거래처·상품 자료를 불러오지 못했습니다. 다시 시도해 주세요." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!customerItemsImportEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  try {
    const scope = await getRequestAuthScope(request);
    if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    if (!areHoldModulesEnabled(scope.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
    if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "가져오기 권한이 없습니다." }, { status: 403 });
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 512_000) return NextResponse.json({ message: "한 번에 1,000개 이하로 나누어 저장해 주세요." }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return NextResponse.json({ message: "요청 형식을 확인해 주세요." }, { status: 400 }); }
    if (body && typeof body === "object" && !Array.isArray(body) && "editedRows" in body) {
      if (!customerItemsFileImportEnabled()) return NextResponse.json({ message: "파일 가져오기 준비가 완료되지 않았습니다." }, { status: 404 });
      if (Object.keys(body).length !== 2 || !("fileName" in body)) return NextResponse.json({ message: "파일과 행 정보를 확인해 주세요." }, { status: 400 });
      return NextResponse.json(await writeCustomerItemFile(scope.companyId, body.fileName, body.editedRows,
        scope.customerSession?.name || scope.adminSession?.name || "운영자"), { headers: { "Cache-Control": "no-store" } });
    }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("rows" in body))
      return NextResponse.json({ message: "rows만 전달해 주세요. 관리자는 회사 조회 조건을 지정해 주세요." }, { status: 400 });
    const result = await importCustomerItems(scope.companyId, body.rows, writeCustomerItems);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CustomerItemImportError) return NextResponse.json({ message: error.message }, { status: 400 });
    // Do not return/log raw SQL errors or imported business prices.
    return NextResponse.json({ message: "저장하지 못했습니다. 회사·상품 연결과 같은 날짜의 단가 충돌을 확인해 주세요." }, { status: 409 });
  }
}
