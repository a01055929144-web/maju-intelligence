import { NextRequest, NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";
import { CustomerRow, sampleCustomers } from "@/lib/sample-data";
import { ColumnMapping, RawUploadRow, saveAnalysis } from "@/lib/store";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    actorName?: string;
    columnMapping?: ColumnMapping;
    companyName?: string;
    originalFilename?: string;
    rawRows?: RawUploadRow[];
    rows?: CustomerRow[];
    uploadType?: "customer-master" | "sales-analysis";
  } | null;
  const customerSession = getCustomerSession();
  const rows = body?.rows?.length ? body.rows : sampleCustomers;
  const result = await saveAnalysis(rows, body?.companyName, {
    actorName: body?.actorName,
    columnMapping: body?.columnMapping,
    companyId: customerSession?.companyId,
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
    reportId: result.reportId,
    report: result.report
  });
}
