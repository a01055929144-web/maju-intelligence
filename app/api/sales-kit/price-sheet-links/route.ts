import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { supabaseRequest } from "@/lib/store";
import { equalShareHash, issueDocumentShareToken } from "@/lib/pricing/document-share-token";
import { documentSharingEnabled } from "@/lib/pricing/document-share-feature";

export const dynamic = "force-dynamic";

type ShareRow = {
  id: string;
  document_id: string;
  document_version_id: string;
  token_hash: string;
  token_nonce: string;
  created_at: string;
  expires_at: string;
};

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!documentSharingEnabled(scope.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  try {
    const company = encodeURIComponent(scope.companyId);
    const now = encodeURIComponent(new Date().toISOString());
    const rows = await supabaseRequest<ShareRow[]>(
      `pricing_document_share_links?company_id=eq.${company}&lead_id=is.null&send_id=is.null&revoked_at=is.null&expires_at=gt.${now}&select=id,document_id,document_version_id,token_hash,token_nonce,created_at,expires_at&order=created_at.desc&limit=50`
    );
    if (!rows.length) return NextResponse.json({ links: [] }, { headers: { "Cache-Control": "private, no-store" } });
    const versionIds = rows.map((row) => row.document_version_id).join(",");
    const versions = await supabaseRequest<Array<{ id: string; content: { title?: unknown }; published_at: string }>>(
      `pricing_document_versions?company_id=eq.${company}&id=in.(${versionIds})&published_at=not.is.null&select=id,content,published_at`
    );
    const byId = new Map(versions.map((version) => [version.id, version]));
    const links = rows.flatMap((row) => {
      const version = byId.get(row.document_version_id);
      if (!version) return [];
      const issued = issueDocumentShareToken(row.id, row.token_nonce);
      if (!equalShareHash(issued.hash, row.token_hash)) return [];
      return [{
        id: row.id,
        title: typeof version.content?.title === "string" && version.content.title.trim() ? version.content.title.trim() : "발행 단가표",
        publishedAt: version.published_at,
        expiresAt: row.expires_at,
        url: `${request.nextUrl.origin}/pricing-document#${issued.token}`
      }];
    });
    return NextResponse.json({ links }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ message: "발행한 단가표를 불러오지 못했습니다." }, { status: 503 });
  }
}
