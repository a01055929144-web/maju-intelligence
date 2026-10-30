import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getRequestAuthScope } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { issueStoreLinkToken } from "@/lib/pricing/store-link-token";
import { supabaseRequest } from "@/lib/store";
import { isId } from "@/domains/pricing/document";

export const dynamic = "force-dynamic";

type LinkRow = {
  id: string;
  customer_id: string;
  document_version_id: string;
  token_nonce: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  can_order: boolean;
  view_count: number;
  last_viewed_at: string | null;
};
type LinkMetric = {
  link_id: string;
  order_count: number;
  recent_views: number;
  last_order_at: string | null;
};

function storePublicBase() {
  const configured = process.env.STORE_PUBLIC_BASE_URL;
  if (!configured) throw new Error("Store public URL is not configured");
  const url = new URL(configured);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production")
    throw new Error("Store public URL must use HTTPS");
  return url.origin;
}

async function scope(request: NextRequest, companyId?: string) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled())
    return NextResponse.json(
      { message: "사용할 수 없는 기능입니다." },
      { status: 404 },
    );
  const auth = await getRequestAuthScope(request, companyId);
  if (!auth.ok)
    return NextResponse.json(
      { message: "로그인이 필요합니다." },
      { status: 401 },
    );
  if (!auth.companyId || !areHoldModulesEnabled(auth.companyId))
    return NextResponse.json(
      { message: "사용할 수 없는 기능입니다." },
      { status: 404 },
    );
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession))
    return NextResponse.json(
      { message: "링크 관리 권한이 없습니다." },
      { status: 403 },
    );
  const identity =
    auth.customerSession?.userId ||
    auth.customerSession?.companyMemberId ||
    auth.customerSession?.email ||
    auth.adminSession?.email;
  if (!identity)
    return NextResponse.json(
      { message: "작성자를 확인해 주세요." },
      { status: 403 },
    );
  return {
    company: auth.companyId,
    actor: createHash("sha256")
      .update(
        `${auth.companyId}:${auth.customerSession ? "customer" : "admin"}:${identity}`,
      )
      .digest("hex"),
  };
}

async function accessibleVersions(
  company: string,
  actor: string,
  versionIds: string[],
) {
  if (!versionIds.length) return new Set<string>();
  const versions = await supabaseRequest<{ id: string; document_id: string }[]>(
    `pricing_document_versions?company_id=eq.${company}&id=in.(${versionIds.join(",")})&select=id,document_id`,
  );
  if (!versions.length) return new Set<string>();
  const documents = await supabaseRequest<
    { id: string; kind: string; owner_key: string }[]
  >(
    `pricing_documents?company_id=eq.${company}&id=in.(${Array.from(new Set(versions.map((v) => v.document_id))).join(",")})&select=id,kind,owner_key`,
  );
  const allowed = new Set(
    documents
      .filter((d) => d.kind === "sheet" || d.owner_key === actor)
      .map((d) => d.id),
  );
  return new Set(
    versions.filter((v) => allowed.has(v.document_id)).map((v) => v.id),
  );
}

function sameOrigin(request: NextRequest) {
  const raw = request.headers.get("origin");
  if (!raw) return true;
  try {
    return (
      new URL(raw).host.toLowerCase() ===
      (request.headers.get("host") || request.nextUrl.host).toLowerCase()
    );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const scoped = await scope(
    request,
    request.nextUrl.searchParams.get("companyId") || undefined,
  );
  if (scoped instanceof NextResponse) return scoped;
  const { company, actor } = scoped;
  const page = Number(request.nextUrl.searchParams.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
    return NextResponse.json(
      { message: "페이지를 확인해 주세요." },
      { status: 400 },
    );
  try {
    const detailId = request.nextUrl.searchParams.get("linkId");
    if (detailId) {
      if (!isId(detailId))
        return NextResponse.json(
          { message: "링크를 확인해 주세요." },
          { status: 400 },
        );
      const rows = await supabaseRequest<LinkRow[]>(
        `storefront_links?company_id=eq.${encodeURIComponent(company)}&id=eq.${detailId}&select=id,customer_id,document_version_id,token_nonce,issued_at,expires_at,revoked_at,can_order,view_count,last_viewed_at&limit=1`,
      );
      if (
        !rows.length ||
        !(
          await accessibleVersions(company, actor, [
            rows[0].document_version_id,
          ])
        ).size
      )
        return NextResponse.json(
          { message: "링크를 찾지 못했습니다." },
          { status: 404 },
        );
      const events = await supabaseRequest<
        {
          id: string;
          event_type: string;
          occurred_at: string;
          device_class: string | null;
          actor_name: string | null;
        }[]
      >(
        `storefront_link_events?company_id=eq.${encodeURIComponent(company)}&link_id=eq.${detailId}&select=id,event_type,occurred_at,device_class,actor_name&order=occurred_at.desc,id.desc&limit=50`,
      );
      return NextResponse.json(
        { events },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (request.nextUrl.searchParams.get("customerPage") === "1") {
      const cursor = request.nextUrl.searchParams.get("afterId");
      if (cursor && !isId(cursor))
        return NextResponse.json(
          { message: "거래처 페이지를 확인해 주세요." },
          { status: 400 },
        );
      const customers = await supabaseRequest<
        { id: string; customer_name: string; address: string | null }[]
      >(
        `normalized_customers?company_id=eq.${encodeURIComponent(company)}` +
          `${cursor ? `&id=gt.${cursor}` : ""}&select=id,customer_name,address&order=id.asc&limit=51`,
      );
      const items = customers.slice(0, 50);
      return NextResponse.json(
        { items, nextCursor: customers.length > 50 ? items.at(-1)?.id : null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const offset = (page - 1) * 50;
    const links = await supabaseRequest<LinkRow[]>(
      `storefront_links?company_id=eq.${encodeURIComponent(company)}&select=id,customer_id,document_version_id,token_nonce,issued_at,expires_at,revoked_at,can_order,view_count,last_viewed_at&order=issued_at.desc,id.desc&limit=50&offset=${offset}`,
    );
    const allowedVersions = await accessibleVersions(
      company,
      actor,
      Array.from(new Set(links.map((l) => l.document_version_id))),
    );
    const visibleLinks = links.filter((l) =>
      allowedVersions.has(l.document_version_id),
    );
    const customerIds = Array.from(
      new Set(links.map((link) => link.customer_id)),
    );
    const versionIds = Array.from(
      new Set(links.map((link) => link.document_version_id)),
    );
    const [customers, versions, metrics] = await Promise.all([
      customerIds.length
        ? supabaseRequest<{ id: string; customer_name: string }[]>(
            `normalized_customers?company_id=eq.${encodeURIComponent(company)}&id=in.(${customerIds.join(",")})&select=id,customer_name`,
          )
        : Promise.resolve([]),
      versionIds.length
        ? supabaseRequest<
            {
              id: string;
              document_id: string;
              version: number;
              content: { title?: string };
            }[]
          >(
            `pricing_document_versions?company_id=eq.${encodeURIComponent(company)}&id=in.(${versionIds.join(",")})&select=id,document_id,version,content`,
          )
        : Promise.resolve([]),
      links.length
        ? supabaseRequest<LinkMetric[]>("rpc/storefront_link_metrics", {
            method: "POST",
            body: JSON.stringify({
              p_company: company,
              p_links: links.map((link) => link.id),
            }),
          })
        : Promise.resolve([]),
    ]);
    const customerNames = new Map(
      customers.map((item) => [item.id, item.customer_name]),
    );
    const versionInfo = new Map(versions.map((item) => [item.id, item]));
    const metricByLink = new Map(metrics.map((item) => [item.link_id, item]));
    return NextResponse.json(
      {
        items: visibleLinks.map((link) => {
          const version = versionInfo.get(link.document_version_id);
          const metric = metricByLink.get(link.id);
          return {
            id: link.id,
            customerId: link.customer_id,
            customerName: customerNames.get(link.customer_id) ?? "거래처",
            documentVersionId: link.document_version_id,
            documentId: version?.document_id ?? null,
            documentTitle: version?.content.title ?? "문서",
            documentVersion: version?.version ?? null,
            url: `${storePublicBase()}/store#${issueStoreLinkToken(link.id, link.token_nonce).token}`,
            issuedAt: link.issued_at,
            expiresAt: link.expires_at,
            revokedAt: link.revoked_at,
            canOrder: link.can_order,
            viewCount: link.view_count,
            lastViewedAt: link.last_viewed_at,
            orderCount: metric?.order_count ?? 0,
            recentViews: metric?.recent_views ?? 0,
            lastOrderAt: metric?.last_order_at ?? null,
            interest:
              (metric?.order_count ?? 0) > 0
                ? "주문 중"
                : (metric?.recent_views ?? 0) >= 3
                  ? "관심 높음"
                  : link.view_count > 0
                    ? "열람"
                    : "미열람",
          };
        }),
        hasMore: links.length === 50,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { message: "매장 링크를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { message: "같은 화면에서 다시 시도해 주세요." },
      { status: 403 },
    );
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { message: "입력값을 확인해 주세요." },
      { status: 400 },
    );
  }
  const scoped = await scope(
    request,
    typeof body.companyId === "string" ? body.companyId : undefined,
  );
  if (scoped instanceof NextResponse) return scoped;
  const { company, actor } = scoped;
  const actorScope = await getRequestAuthScope(request, company);
  if (!actorScope.ok || actorScope.companyId !== company)
    return NextResponse.json(
      { message: "로그인이 필요합니다." },
      { status: 401 },
    );
  const actorUserId = actorScope.customerSession?.userId;
  const actorName =
    getCustomerOperationalName(actorScope.customerSession) ||
    actorScope.adminSession?.name ||
    "운영자";
  try {
    if (body.action === "create" || body.action === "create-batch") {
      const publicBase = storePublicBase();
      const customerIds =
        body.action === "create" ? [body.customerId] : body.customerIds;
      if (
        !Array.isArray(customerIds) ||
        customerIds.length < 1 ||
        customerIds.length > 100 ||
        !customerIds.every(isId) ||
        new Set(customerIds).size !== customerIds.length ||
        !isId(body.documentVersionId)
      )
        throw new Error("거래처와 발행 문서를 선택해 주세요.");
      const [customer, version] = await Promise.all([
        supabaseRequest<{ id: string }[]>(
          `normalized_customers?company_id=eq.${encodeURIComponent(company)}&id=in.(${customerIds.join(",")})&select=id&limit=100`,
        ),
        supabaseRequest<{ id: string }[]>(
          `pricing_document_versions?company_id=eq.${encodeURIComponent(company)}&id=eq.${body.documentVersionId}&select=id&limit=1`,
        ),
      ]);
      if (customer.length !== customerIds.length || !version.length)
        throw new Error("같은 회사의 거래처와 발행 문서를 선택해 주세요.");
      if (
        !(await accessibleVersions(company, actor, [body.documentVersionId]))
          .size
      )
        throw new Error("이 문서를 발급할 권한이 없습니다.");
      const expires = new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const generated = customerIds.map((customerId) => {
        const id = randomUUID();
        return { id, customerId, ...issueStoreLinkToken(id) };
      });
      const issued = await supabaseRequest<
        {
          issued_customer_id: string;
          issued_link_id: string;
          issued_token_nonce: string;
          issued_token_hash: string;
          was_created: boolean;
        }[]
      >("rpc/issue_storefront_links", {
        method: "POST",
        body: JSON.stringify({
          p_company: company,
          p_document_version: body.documentVersionId,
          p_links: generated.map((item) => ({
            customerId: item.customerId,
            id: item.id,
            nonce: item.nonce,
            hash: item.hash,
          })),
          p_expires_at: expires,
          p_actor_key: actor,
          p_actor_user_id: isId(actorUserId) ? actorUserId : null,
        }),
      });
      const links = issued.map((item) => {
        const token = issueStoreLinkToken(
          item.issued_link_id,
          item.issued_token_nonce,
        );
        if (token.hash !== item.issued_token_hash)
          throw new Error(
            "기존 링크 서명 설정이 변경됐습니다. 이전 링크를 회수한 뒤 다시 발급해 주세요.",
          );
        return {
          id: item.issued_link_id,
          customerId: item.issued_customer_id,
          created: item.was_created,
          url: `${publicBase}/store#${token.token}`,
        };
      });
      return NextResponse.json(
        body.action === "create" ? { ...links[0] } : { links },
      );
    }
    if (!isId(body.id)) throw new Error("링크를 확인해 주세요.");
    const managedLinks = await supabaseRequest<
      { document_version_id: string }[]
    >(
      `storefront_links?company_id=eq.${company}&id=eq.${body.id}&select=document_version_id&limit=1`,
    );
    if (
      !managedLinks.length ||
      !(
        await accessibleVersions(company, actor, [
          managedLinks[0].document_version_id,
        ])
      ).size
    )
      throw new Error("링크를 찾지 못했습니다.");
    if (body.action === "mark-sent") {
      const rows = await supabaseRequest<{ id: string }[]>(
        `storefront_links?company_id=eq.${encodeURIComponent(company)}&id=eq.${body.id}&select=id&limit=1`,
      );
      if (!rows.length) throw new Error("링크를 찾지 못했습니다.");
      await supabaseRequest("storefront_link_events", {
        method: "POST",
        body: JSON.stringify({
          company_id: company,
          link_id: body.id,
          event_type: "sent",
          device_class: null,
          actor_user_id: isId(actorUserId) ? actorUserId : null,
          actor_name: actorName.slice(0, 100),
        }),
      });
      return NextResponse.json({ saved: true });
    }
    if (body.action === "revoke" || body.action === "set-ordering") {
      const patch =
        body.action === "revoke"
          ? { revoked_at: new Date().toISOString(), can_order: false }
          : { can_order: body.canOrder === true };
      const rows = await supabaseRequest<{ id: string }[]>(
        `storefront_links?company_id=eq.${encodeURIComponent(company)}&id=eq.${body.id}&select=id`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      if (!rows.length) throw new Error("링크를 찾지 못했습니다.");
      return NextResponse.json({ saved: true });
    }
    throw new Error("링크 요청을 확인해 주세요.");
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error &&
          !error.message.startsWith("Supabase request failed")
            ? error.message
            : "링크를 저장하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
