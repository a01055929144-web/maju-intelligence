import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { ColumnMapping, deleteExcelMappingPreset, getExcelMappingPreset, upsertExcelMappingPreset } from "@/lib/store";

export const dynamic = "force-dynamic";

const uploadTypes = ["customer-master", "sales-analysis"] as const;
type UploadType = (typeof uploadTypes)[number];

function isUploadType(value: unknown): value is UploadType {
  return uploadTypes.includes(value as UploadType);
}

// 2026-08-26 보안 수정: 이전에는 로그인 세션이 전혀 없어도(고객/관리자 세션 모두 null) companyId가
// undefined인 채로 조회·저장·삭제가 그대로 실행되어, 인증 없이 엑셀 컬럼 매핑 프리셋을 읽고 쓰고
// 지울 수 있었습니다. getRequestAuthScope로 세션을 필수로 검증하도록 수정합니다.

export async function GET(request: NextRequest) {
  const uploadType = request.nextUrl.searchParams.get("uploadType");
  if (!isUploadType(uploadType)) {
    return NextResponse.json({ message: "uploadType은 customer-master 또는 sales-analysis 여야 합니다." }, { status: 400 });
  }

  const scope = await getRequestAuthScope(request);
  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const result = await getExcelMappingPreset(uploadType, scope.companyId);
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

  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!isUploadType(body?.uploadType)) {
    return NextResponse.json({ message: "uploadType은 customer-master 또는 sales-analysis 여야 합니다." }, { status: 400 });
  }

  if (!body?.mapping || typeof body.mapping !== "object") {
    return NextResponse.json({ message: "저장할 컬럼 매핑이 필요합니다." }, { status: 400 });
  }

  const result = await upsertExcelMappingPreset({
    companyId: scope.companyId,
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

  const scope = await getRequestAuthScope(request);
  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const result = await deleteExcelMappingPreset(uploadType, scope.companyId);
  return NextResponse.json(result);
}
