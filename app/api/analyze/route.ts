import { NextRequest, NextResponse } from "next/server";
import { getCustomerImportLimitMessage } from "@/domains/customer/customer-import-limits";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { CustomerRow } from "@/lib/sample-data";
import { ColumnMapping, RawUploadRow, saveAnalysis } from "@/lib/store";

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  const sizeLimitMessage = getCustomerImportLimitMessage({ contentLength, mappingCount: 0, rowCount: 0 });
  if (sizeLimitMessage) {
    return NextResponse.json({ message: sizeLimitMessage }, { status: 413 });
  }
  const body = (await request.json().catch(() => null)) as {
    actorName?: string;
    columnMapping?: ColumnMapping;
    companyName?: string;
    companyId?: string;
    originalFilename?: string;
    rawRows?: RawUploadRow[];
    rows?: CustomerRow[];
    uploadType?: "customer-master" | "sales-analysis";
  } | null;
  const parsedBytes = body ? new TextEncoder().encode(JSON.stringify(body)).byteLength : 0;
  const countLimitMessage = getCustomerImportLimitMessage({
    contentLength: Math.max(contentLength, parsedBytes),
    mappingCount: Object.keys(body?.columnMapping || {}).length,
    rowCount: body?.rows?.length || 0
  });
  if (countLimitMessage) {
    return NextResponse.json({ message: countLimitMessage }, { status: 413 });
  }
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const requiredCapability = body?.uploadType === "sales-analysis" ? "manage_sales" : "manage_customers";
  if (!scopeHasCapability(scope, requiredCapability)) {
    return NextResponse.json({ message: "이 데이터를 등록할 권한이 없습니다." }, { status: 403 });
  }

  const rows = body?.rows || [];
  if (!rows.length) {
    return NextResponse.json({ message: "저장할 거래처 또는 매출 데이터가 없습니다. 엑셀 업로드나 수기 등록을 먼저 완료하세요." }, { status: 400 });
  }

  const result = await saveAnalysis(rows, body?.companyName, {
    actorName: body?.actorName,
    columnMapping: body?.columnMapping,
    companyId: scope.companyId,
    originalFilename: body?.originalFilename,
    rawRows: body?.rawRows,
    uploadType: body?.uploadType
  });

  return NextResponse.json({
    status: "completed",
    persisted: result.persisted,
    companyId: result.companyId,
    uploadedFileId: result.uploadedFileId,
    importId: result.importId,
    pipeline: result.pipeline,
    warning: result.pipeline.postProcessingWarning,
    reportId: result.reportId,
    report: result.report
  });
}
