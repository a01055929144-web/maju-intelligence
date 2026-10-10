import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { uploadSalesQuotePhoto } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function POST(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "견적 사진을 저장할 권한이 없습니다." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  const leadId = String(form?.get("leadId") || "");
  if (!(file instanceof File) || !leadId) return NextResponse.json({ message: "사진과 리드 정보가 필요합니다." }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ message: "JPG, PNG, WEBP, HEIC 사진만 업로드할 수 있습니다." }, { status: 415 });
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) return NextResponse.json({ message: "사진은 8MB 이하만 업로드할 수 있습니다." }, { status: 413 });

  try {
    const storagePath = await uploadSalesQuotePhoto({
      bytes: await file.arrayBuffer(), companyId: scope.companyId!, contentType: file.type, filename: file.name, leadId
    });
    return NextResponse.json({ storagePath });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "사진을 저장하지 못했습니다." }, { status: 500 });
  }
}
