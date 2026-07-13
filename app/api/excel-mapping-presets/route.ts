import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { ColumnMapping, deleteExcelMappingPreset, getExcelMappingPreset, upsertExcelMappingPreset } from "@/lib/store";

export const dynamic = "force-dynamic";

const uploadTypes = ["customer-master", "sales-analysis"] as const;
type UploadType = (typeof uploadTypes)[number];

function isUploadType(value: unknown): value is UploadType {
  return uploadTypes.includes(value as UploadType);
}

function resolveCompanyId(request: NextRequest, bodyCompanyId?: string) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();
  const queryCompanyId = request.nextUrl.searchParams.get("companyId") || undefined;

  return customerSession?.companyId || (adminSession ? bodyCompanyId || queryCompanyId : undefined);
}

export async function GET(request: NextRequest) {
  const uploadType = request.nextUrl.searchParams.get("uploadType");
  if (!isUploadType(uploadType)) {
    return NextResponse.json({ message: "uploadType은 customer-master 또는 sales-analysis 여야 합니다." }, { status: 400 });
  }

  const companyId = resolveCompanyId(request);
  const result = await getExcelMappingPreset(uploadType, companyId);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        companyId?: string;
        erpName?: string;
        mapping?: ColumnMapping;
        presetName?: string;
        uploadType?: UploadType;
      }
    | null;

  if (!isUploadType(body?.uploadType)) {
    return NextResponse.json({ message: "uploadType은 customer-master 또는 sales-analysis 여야 합니다." }, { status: 400 });
  }

  if (!body?.mapping || typeof body.mapping !== "object") {
    return NextResponse.json({ message: "저장할 컬럼 매핑이 필요합니다." }, { status: 400 });
  }

  const companyId = resolveCompanyId(request, body.companyId);
  const result = await upsertExcelMappingPreset({
    companyId,
    erpName: body.erpName,
    mapping: body.mapping,
    presetName: body.presetName,
    uploadType: body.uploadType
  });

  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const uploadType = request.nextUrl.searchParams.get("uploadType");
  if (!isUploadType(uploadType)) {
    return NextResponse.json({ message: "uploadType은 customer-master 또는 sales-analysis 여야 합니다." }, { status: 400 });
  }

  const companyId = resolveCompanyId(request);
  const result = await deleteExcelMappingPreset(uploadType, companyId);
  return NextResponse.json(result);
}
