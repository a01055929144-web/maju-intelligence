import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";
import { isActiveCompanyOwner, listSensitiveAccessLogs, recordSensitiveAccessLog, sensitiveAccessLogsEnabled } from "@/lib/store/07-sensitive-access-logs";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store, private, max-age=0" };

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  if (!sensitiveAccessLogsEnabled()) {
    return NextResponse.json({ message: "민감정보 열람 기록 내보내기가 아직 승인되지 않았습니다." }, { headers: noStoreHeaders, status: 503 });
  }
  const session = await getCustomerSession();
  if (!session?.userId) return NextResponse.json({ message: "Unauthorized" }, { headers: noStoreHeaders, status: 401 });
  if (!(await isActiveCompanyOwner({ companyId: session.companyId, userId: session.userId }))) {
    return NextResponse.json({ message: "민감정보 열람 기록은 회사 대표만 내보낼 수 있습니다." }, { headers: noStoreHeaders, status: 403 });
  }

  try {
    const records = await listSensitiveAccessLogs(session.companyId, { includeHidden: true });
    const header = ["시각", "사용자", "역할", "매장", "항목", "기기", "경로", "주의", "숨김시각"];
    const rows = records.map((record) => [record.accessedAt, record.actorName, record.actorRole, record.storeName, record.item, record.deviceLabel, record.pagePath, record.warningCodes.join("|"), record.hiddenAt || ""]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;

    const recorded = await recordSensitiveAccessLog({
      actorName: session.operationalDisplayName || session.name,
      actorRole: "owner",
      actorUserId: session.userId,
      companyId: session.companyId,
      item: "export",
      pagePath: "/dashboard/settings/security",
      warningCodes: ["export"]
    });
    if (!recorded) return NextResponse.json({ message: "민감정보 열람 기록 내보내기가 비활성화됐습니다." }, { headers: noStoreHeaders, status: 503 });

    return new NextResponse(csv, {
      headers: {
        ...noStoreHeaders,
        "Content-Disposition": 'attachment; filename="sensitive-access-logs.csv"',
        "Content-Type": "text/csv; charset=utf-8"
      }
    });
  } catch {
    return NextResponse.json({ message: "감사 기록을 저장하지 못해 파일을 만들지 않았습니다." }, { headers: noStoreHeaders, status: 503 });
  }
}
