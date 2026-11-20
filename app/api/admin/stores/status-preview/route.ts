import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIXTURE_STORE = "10000000-0000-4000-8000-000000000001";

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (session.role !== "super_admin") return NextResponse.json({ message: "대표 관리자 권한이 필요합니다." }, { status: 403 });
  if (process.env.CI_ADMIN_STORE_FIXTURES !== "enabled" || process.env.VERCEL_ENV === "production") return NextResponse.json({ message: "준비 중인 기능입니다." }, { status: 404 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const allowed = (process.env.FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS || "").split(",").map((id) => id.trim());
  if (!body || typeof body.companyId !== "string" || !UUID.test(body.companyId) || !allowed.includes(body.companyId)
    || body.storeProfileId !== FIXTURE_STORE || (body.status !== "active" && body.status !== "suspended")
    || typeof body.requestKey !== "string" || body.requestKey.length < 16 || body.requestKey.length > 200) {
    return NextResponse.json({ message: "허용된 회사와 매장을 확인해 주세요." }, { status: 400 });
  }

  return NextResponse.json({
    alreadyApplied: false,
    auditLogId: `preview-${body.requestKey}`,
    companyId: body.companyId,
    status: body.status,
    storeProfileId: body.storeProfileId,
  });
}
