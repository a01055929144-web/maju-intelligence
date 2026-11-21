import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  adminDistributorIndustriesEnabled, listDistributorIndustries, previewCompanyDistributorIndustries,
  previewDistributorIndustryCategory, saveDistributorIndustryCategory, setCompanyDistributorIndustries
} from "@/lib/admin-distributor-industries";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = () => NextResponse.json({ message: "업종 관리 기능이 준비 중입니다." }, { status: 404 });

export async function GET(request: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId || !UUID.test(companyId)) return NextResponse.json({ message: "회사를 확인해 주세요." }, { status: 400 });
  if (!adminDistributorIndustriesEnabled(companyId)) return unavailable();
  try { return NextResponse.json(await listDistributorIndustries(companyId)); }
  catch (error) { console.error("distributor industries read failed", error); return NextResponse.json({ message: "선행 SQL 적용 후 사용할 수 있습니다." }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const companyId = typeof body?.companyId === "string" ? body.companyId : "";
  if (!UUID.test(companyId)) return NextResponse.json({ message: "회사를 확인해 주세요." }, { status: 400 });
  if (!adminDistributorIndustriesEnabled(companyId)) return unavailable();
  const categoryIds = Array.isArray(body?.categoryIds) && body.categoryIds.every((id) => typeof id === "string" && UUID.test(id)) ? body.categoryIds as string[] : null;
  try {
    if (body?.action === "preview_assignment" && categoryIds) return NextResponse.json(await previewCompanyDistributorIndustries(companyId, categoryIds));
    if (body?.action === "set_assignment" && categoryIds && typeof body.requestKey === "string" && body.requestKey.trim()) return NextResponse.json(await setCompanyDistributorIndustries({ companyId, categoryIds, actorName: session.name, requestKey: body.requestKey }));
    if (body?.action === "preview_category" && typeof body.categoryId === "string" && UUID.test(body.categoryId)) return NextResponse.json(await previewDistributorIndustryCategory(body.categoryId));
    if (body?.action === "save_category" && (body.categoryId === undefined || typeof body.categoryId === "string") && typeof body.displayName === "string" && body.displayName.trim().length > 0 && body.displayName.trim().length <= 80 && (body.status === "active" || body.status === "retired") && typeof body.requestKey === "string" && body.requestKey.trim()) {
      if (body.categoryId && !UUID.test(body.categoryId)) return NextResponse.json({ message: "분류 ID를 확인해 주세요." }, { status: 400 });
      return NextResponse.json(await saveDistributorIndustryCategory({ categoryId: body.categoryId as string | undefined, displayName: body.displayName, status: body.status, actorName: session.name, requestKey: body.requestKey }));
    }
    return NextResponse.json({ message: "요청 내용을 확인해 주세요." }, { status: 400 });
  } catch (error) {
    console.error("distributor industries change failed", error);
    return NextResponse.json({ message: "선행 SQL 적용 상태와 입력값을 확인해 주세요." }, { status: 503 });
  }
}
