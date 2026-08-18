import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getPermitLeadQueues, ingestPermitLeadRows, listPermitLeads, PermitLeadIngestRow, PermitLeadPeriod } from "@/lib/store";

export const dynamic = "force-dynamic";

// GET: 리드 목록(필터 포함) + 4개 액션 큐(오늘 전화/이번 주 방문/DM/보강 필요)를 함께 내려줍니다.
// 화면이 두 번 호출하지 않도록 한 번에 묶어서 반환합니다.
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const period = (params.get("period") || "all") as PermitLeadPeriod | "all";
  const industry = params.get("industry") || undefined;
  const action = params.get("action") || undefined;
  const grade = params.get("grade") || undefined;
  const hasPhone = params.get("hasPhone") === "true";
  const excludeExcluded = params.get("excludeExcluded") !== "false";

  const [{ leads, total }, queues] = await Promise.all([
    listPermitLeads(scope.companyId!, { period, industry, action, grade, hasPhone, excludeExcluded }),
    getPermitLeadQueues(scope.companyId!)
  ]);

  return NextResponse.json({ leads, total, queues });
}

// POST: 사업자 인허가 데이터 업로드(엑셀/CSV를 클라이언트에서 미리 파싱한 행 배열)를 일괄 적재합니다.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; rows?: PermitLeadIngestRow[] } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "신규 리드를 업로드할 권한이 없습니다." }, { status: 403 });
  }

  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) {
    return NextResponse.json({ message: "업로드할 행이 없습니다." }, { status: 400 });
  }
  if (rows.length > 5000) {
    return NextResponse.json({ message: "한 번에 5,000행까지만 업로드할 수 있습니다. 파일을 나눠서 업로드하세요." }, { status: 400 });
  }

  const result = await ingestPermitLeadRows(scope.companyId!, rows);
  return NextResponse.json(result);
}
