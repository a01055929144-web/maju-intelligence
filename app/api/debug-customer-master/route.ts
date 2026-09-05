import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { getCustomerMaster } from "@/lib/store";

export const dynamic = "force-dynamic";

// TEMPORARY diagnostic route — pinpoints why getCustomerMaster() is throwing in production.
// 2026-08-31 완성도 감사 대응: 삭제 전까지는 최소한 관리자 인증 없이는 접근 못 하도록 막습니다
// (원래 인증 없이 실 고객사 데이터 건수를 누구나 조회할 수 있었음).
export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await getCustomerMaster();
    return NextResponse.json({ ok: true, count: result.customers.length });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
