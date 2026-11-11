import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { setCompanyKind } from "@/lib/store";

export const dynamic = "force-dynamic";
const KINDS = new Set(["customer", "pilot", "internal"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// CC-22b: 회사 구분 변경은 MAJU 관리자만(고객사 화면·API에는 이 경로가 없다). 바뀐 값은 admin_audit_logs에 남는다.
export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { companyId?: string; kind?: string } | null;
  if (!body?.companyId || !UUID.test(body.companyId) || !body.kind || !KINDS.has(body.kind)) return NextResponse.json({ message: "회사와 구분을 확인해 주세요." }, { status: 400 });
  try {
    return NextResponse.json(await setCompanyKind(body.companyId, body.kind as "customer" | "pilot" | "internal", session.name));
  } catch (error) {
    if (error instanceof Error && error.message === "company_not_found") return NextResponse.json({ message: "회사를 찾을 수 없습니다." }, { status: 404 });
    console.error("company kind change failed", error);
    return NextResponse.json({ message: "구분을 바꾸지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
