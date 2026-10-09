import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { listProductCatalog } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "상품 원장을 조회할 권한이 없습니다." }, { status: 403 });
  const items = await listProductCatalog(scope.companyId!, request.nextUrl.searchParams.get("q") || "");
  return NextResponse.json({ items });
}
