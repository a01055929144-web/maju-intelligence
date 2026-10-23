import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { backfillLeadFingerprintsPage } from "@/lib/lead-fingerprint-backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json() as {
      companyId?: string;
      batchId?: string;
      cursor?: string;
      limit?: number;
    };
    const companyId = body.companyId?.trim();
    if (!companyId) return NextResponse.json({ message: "회사 ID가 필요합니다." }, { status: 400 });
    return NextResponse.json(await backfillLeadFingerprintsPage({ ...body, companyId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "fingerprint 백필에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
