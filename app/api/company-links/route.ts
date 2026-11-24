import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { isId } from "@/domains/pricing/document";
import { supabaseRequest } from "@/lib/store";
import { documentSharingEnabled } from "@/lib/pricing/document-share-feature";
import { companyLinkOverview, ensureCompanyLink, revokeCompanyLink, setDefaultDocument, systemActor } from "@/lib/pricing/company-links";
import { DocumentSendError } from "@/domains/pricing/document-send";

// CX-140: 고객사 공개 링크 관리(고객사 본인 화면·마주 관리자 화면 공용). 기본 OFF + 회사 allowlist(COMPANY_LINK_UNIFY).
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const reply = (status: number, message: string) => NextResponse.json({ message }, { status, headers });

async function authorize(request: NextRequest, companyId?: string) {
  const auth = await getRequestAuthScope(request, companyId);
  if (!auth.ok || !auth.companyId) return { error: reply(401, "로그인이 필요합니다.") } as const;
  const company = auth.companyId;
  if (!isFeatureEnabled("COMPANY_LINK_UNIFY", company) || !documentSharingEnabled(company)) return { error: reply(404, "사용할 수 없는 기능입니다.") } as const;
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return { error: reply(403, "링크 관리 권한이 없습니다.") } as const;
  const who = auth.customerSession?.userId || auth.customerSession?.email || auth.adminSession?.email;
  if (!who) return { error: reply(403, "작성자를 확인할 수 없습니다. 다시 로그인해 주세요.") } as const;
  return { company, admin: Boolean(auth.adminSession && !auth.customerSession), actor: systemActor(company, who) } as const;
}

export async function GET(request: NextRequest) {
  const companyParam = request.nextUrl.searchParams.get("companyId") || undefined;
  if (request.nextUrl.searchParams.get("all") === "1") {
    // 마주 관리자 전용: 플래그가 켜진 회사만(허용 목록 밖 회사는 보이지도 만들지도 않는다).
    const auth = await getRequestAuthScope(request);
    if (!auth.ok || !auth.adminSession || auth.customerSession) return reply(401, "마주 관리자 로그인이 필요합니다.");
    try {
      const companies = await supabaseRequest<Array<{ id: string; name: string }>>("companies?select=id,name&order=name.asc&limit=1000");
      const enabled = companies.filter(c => isFeatureEnabled("COMPANY_LINK_UNIFY", c.id) && documentSharingEnabled(c.id));
      const rows = await Promise.all(enabled.map(async c => ({ companyId: c.id, companyName: c.name, ...(await companyLinkOverview(c.id).catch(() => null)) })));
      return NextResponse.json({ companies: rows }, { headers });
    } catch { return reply(503, "고객사 링크를 불러오지 못했습니다."); }
  }
  const a = await authorize(request, companyParam);
  if ("error" in a) return a.error;
  try { return NextResponse.json(await companyLinkOverview(a.company), { headers }); }
  catch { return reply(503, "링크 목록을 불러오지 못했습니다."); }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply(400, "요청을 확인해 주세요."); }
  try {
    const origin = new URL(request.headers.get("origin") || "invalid");
    if (origin.host.toLowerCase() !== (request.headers.get("host") || request.nextUrl.host).toLowerCase()) return reply(403, "같은 화면에서 다시 시도해 주세요.");
  } catch { return reply(403, "같은 화면에서 다시 시도해 주세요."); }
  const a = await authorize(request, typeof body.companyId === "string" ? body.companyId : undefined);
  if ("error" in a) return a.error;
  try {
    if (body.action === "set-default") {
      if (!(await setDefaultDocument(a.company, a.actor, String(body.documentId)))) return reply(404, "단가표를 찾을 수 없습니다.");
      return NextResponse.json({ ok: true }, { headers });
    }
    if (body.action === "ensure") {
      const documentId = body.documentId === undefined ? undefined : String(body.documentId);
      if (documentId !== undefined && !isId(documentId)) return reply(400, "단가표를 확인해 주세요.");
      const link = await ensureCompanyLink(a.company, a.actor, documentId);
      return link ? NextResponse.json({ link }, { headers }) : reply(404, "링크를 만들 단가표가 없습니다. 먼저 단가표를 게시해 주세요.");
    }
    if (body.action === "revoke") {
      if (!isId(body.linkId)) return reply(400, "링크를 확인해 주세요.");
      return (await revokeCompanyLink(a.company, String(body.linkId))) ? NextResponse.json({ ok: true }, { headers }) : reply(404, "링크를 찾을 수 없습니다.");
    }
    return reply(400, "요청을 확인해 주세요.");
  } catch (error) {
    if (error instanceof DocumentSendError) return reply(error.status, error.message);
    return reply(503, "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
