import { readDocumentSharePreview } from "@/lib/pricing/document-share";
import { documentShareBrandingEnabled } from "@/lib/pricing/document-share-branding-feature";
import { documentShareImage } from "@/lib/pricing/document-share-image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const missing = () => new Response("미리보기 이미지를 사용할 수 없습니다.", { status: 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

export async function GET(_request: Request, { params }: { params: Promise<{ previewId: string }> }) {
  if (!documentShareBrandingEnabled()) return missing();
  try {
    const preview = await readDocumentSharePreview((await params).previewId);
    return preview?.image ? documentShareImage(preview.image) : missing();
  } catch { return missing(); }
}
