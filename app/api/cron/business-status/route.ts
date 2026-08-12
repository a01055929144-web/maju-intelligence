import { NextRequest, NextResponse } from "next/server";
import { refreshAllCompaniesBusinessStatuses } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily cron target (see vercel.json "crons") that refreshes every company's 사업자 휴업/폐업
 * status against the NTS API. Vercel signs cron requests with an Authorization: Bearer header
 * matching CRON_SECRET — see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 * Without CRON_SECRET configured, the endpoint refuses all requests rather than running unauthenticated.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ message: "CRON_SECRET이 설정되지 않아 실행할 수 없습니다." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshAllCompaniesBusinessStatuses();
  return NextResponse.json(result);
}
