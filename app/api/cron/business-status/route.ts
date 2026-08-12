import { NextRequest, NextResponse } from "next/server";
import { refreshAllCompaniesBusinessStatuses, sendDailyChurnRiskDigests } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily cron target (see vercel.json "crons") that (1) refreshes every company's 사업자 휴업/폐업
 * status against the NTS API and (2) sends a Telegram 이탈 위험 거래처 digest to any company that
 * has configured a telegram_chat_id in 회사 설정. Both jobs share one Vercel Hobby cron slot.
 * Vercel signs cron requests with an Authorization: Bearer header matching CRON_SECRET — see
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs. Without CRON_SECRET
 * configured, the endpoint refuses all requests rather than running unauthenticated.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ message: "CRON_SECRET이 설정되지 않아 실행할 수 없습니다." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const [businessStatus, churnRiskDigest] = await Promise.all([refreshAllCompaniesBusinessStatuses(), sendDailyChurnRiskDigests()]);
  return NextResponse.json({ businessStatus, churnRiskDigest });
}
