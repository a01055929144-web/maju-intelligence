import { NextRequest, NextResponse } from "next/server";
import { distributorGate } from "@/lib/distributor-gate";
import { supabaseRequest } from "@/lib/store";
import { cleanPhones } from "@/domains/lead/distributor-import";
import { findDuplicate, kakaoPlaceId, type DedupeRecord } from "@/domains/lead/distributor-dedupe";

export const dynamic = "force-dynamic";

// CC-23: 카카오 장소 검색으로 유통사 리드를 골라 추가. 검색 결과는 화면에 보여 주기만 하고(저장 안 함),
// 사람이 고르고 확인한 값(상호·주소·번호)과 카카오 장소 링크만 저장한다. 좌표·카카오 분류·응답 원본은 저장하지 않는다(약관 보수 해석, 대표 A안 승인).
type KakaoDocument = { id?: string; place_name?: string; address_name?: string; road_address_name?: string; phone?: string; place_url?: string; category_name?: string };

async function existingDistributors(companyId: string): Promise<DedupeRecord[]> {
  // shortcut: 유통사 리드는 회사당 수천 건 이하로 보고 한 번에 읽는다. 그 이상이면 번호·장소 링크로 조회하도록 바꿀 것.
  const rows = await supabaseRequest<Array<{ id: string; business_name: string; address: string | null; phone: string | null; kakao_place_url: string | null }>>(
    `business_permit_leads?select=id,business_name,address,phone,kakao_place_url&company_id=eq.${companyId}&target_type=eq.distributor&merged_into_lead_id=is.null&limit=5000`);
  return rows.map((r) => ({ id: r.id, name: r.business_name, address: r.address ?? "", phone: r.phone, kakaoPlaceUrl: r.kakao_place_url }));
}

export async function GET(request: NextRequest) {
  const g = await distributorGate(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if ("error" in g) return g.error;
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 60);
  const region = (request.nextUrl.searchParams.get("region") || "").trim().slice(0, 30);
  const page = Math.min(3, Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1));
  const key = (process.env.KAKAO_REST_KEY || "").trim();
  if (q.length < 2) return NextResponse.json({ message: "검색어를 2글자 이상 입력하세요.", results: [] }, { status: 400 });
  if (!key || key === "replace-with-kakao-rest-api-key") return NextResponse.json({ message: "카카오 검색 키가 설정되지 않았습니다.", results: [] }, { status: 503 });
  try {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.searchParams.set("query", [region, q].filter(Boolean).join(" "));
    url.searchParams.set("size", "15");
    url.searchParams.set("page", String(page));
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ message: "카카오 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.", results: [] }, { status: 502 });
    const payload = await response.json().catch(() => null) as { documents?: KakaoDocument[] } | null;
    const existing = await existingDistributors(g.companyId);
    const results = (payload?.documents ?? []).flatMap((d) => {
      const kakaoPlaceUrl = d.place_url || (d.id ? `https://place.map.kakao.com/${d.id}` : "");
      if (!d.place_name || !kakaoPlaceId(kakaoPlaceUrl)) return [];
      const candidate = { name: d.place_name, address: d.road_address_name || d.address_name || "", phone: d.phone?.trim() || "", kakaoPlaceUrl };
      return [{ ...candidate, categoryName: d.category_name || "", duplicate: findDuplicate(candidate, existing) }];
    });
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "검색하지 못했습니다. 다시 시도해 주세요.", results: [] }, { status: 503 }); }
}

/** body: { companyId, items: [{ kakaoPlaceUrl, name, address, phone }] } — 서랍에서 사람이 확인·수정한 값. 이미 있는 것은 새로 만들지 않는다. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; items?: Array<{ kakaoPlaceUrl?: string; name?: string; address?: string; phone?: string }> } | null;
  const g = await distributorGate(request, body?.companyId || request.nextUrl.searchParams.get("companyId") || undefined);
  if ("error" in g) return g.error;
  const items = Array.isArray(body?.items) ? body!.items : [];
  if (!items.length || items.length > 30) return NextResponse.json({ message: "추가할 업체를 1~30개 골라 주세요." }, { status: 400 });
  const clean = items.map((item) => ({ kakaoPlaceUrl: String(item.kakaoPlaceUrl ?? "").trim(), name: String(item.name ?? "").trim().slice(0, 300), address: String(item.address ?? "").trim().slice(0, 300), phone: cleanPhones(item.phone).phone ?? "" }));
  if (clean.some((c) => !c.name || !kakaoPlaceId(c.kakaoPlaceUrl))) return NextResponse.json({ message: "상호와 카카오 장소 링크를 확인해 주세요." }, { status: 400 });
  try {
    const known = await existingDistributors(g.companyId);
    const fresh: typeof clean = [], skipped: Array<{ name: string; id?: string; reason: string }> = [];
    for (const c of clean) {
      const duplicate = findDuplicate(c, [...known, ...fresh.map((f) => ({ name: f.name, address: f.address, phone: f.phone, kakaoPlaceUrl: f.kakaoPlaceUrl }))]);
      if (duplicate) skipped.push({ name: c.name, id: duplicate.id, reason: duplicate.reason }); else fresh.push(c);
    }
    const created = fresh.length ? await supabaseRequest<Array<{ id: string }>>("business_permit_leads?select=id", { method: "POST", body: JSON.stringify(fresh.map((c) => ({
      company_id: g.companyId, target_type: "distributor", source: "kakao_keyword_search", lead_period: "recent", is_target_industry: true, status: "신규 수집",
      business_name: c.name, address: c.address || null, phone: c.phone || null, kakao_place_url: c.kakaoPlaceUrl,
    }))) }) : [];
    return NextResponse.json({ created: created.length, skipped });
  } catch (error) {
    console.error("distributor kakao add failed", error);
    return NextResponse.json({ message: "추가하지 못했습니다. 다시 시도해 주세요." }, { status: 503 });
  }
}
