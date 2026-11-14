// 네이버 공식 검색 API(웹문서·블로그)로 인스타그램 아이디 후보를 찾는 인프라 코드입니다.
// 규칙(검색어·추출·점수)은 domains/lead/instagram-discovery.ts에 있고, 여기서는 호출만 합니다.
// 인스타그램 페이지를 직접 긁지 않습니다(약관).
// 키: NAVER API HUB(네이버 클라우드) NCP_DATALAB_CLIENT_ID/SECRET 우선 — 개발자센터 openapi.naver.com 은 2027-06-30 종료.
//     HUB 키가 없을 때만 예전 개발자센터 키 NAVER_SEARCH_CLIENT_ID/SECRET 를 쓴다.

import {
  buildInstagramDiscoveryQueries,
  type InstagramCandidate,
  type InstagramDiscoveryLead,
  type InstagramSearchDocument,
  rankInstagramCandidates
} from "../domains/lead/instagram-discovery";

export type InstagramDiscoveryResult =
  | { ok: true; candidates: InstagramCandidate[]; queries: string[]; documentCount: number }
  | { ok: false; reason: "not_configured" | "search_failed"; message: string; queries: string[] };

type SearchKind = "webkr" | "blog";
export type NaverSearchProvider =
  | { kind: "hub"; clientId: string; clientSecret: string }
  | { kind: "developers"; clientId: string; clientSecret: string };

export function resolveNaverSearchProvider(env: Record<string, string | undefined> = process.env): NaverSearchProvider | null {
  const hubId = (env.NCP_DATALAB_CLIENT_ID || "").trim();
  const hubSecret = (env.NCP_DATALAB_CLIENT_SECRET || "").trim();
  if (hubId && hubSecret) return { kind: "hub", clientId: hubId, clientSecret: hubSecret };
  const devId = (env.NAVER_SEARCH_CLIENT_ID || "").trim();
  const devSecret = (env.NAVER_SEARCH_CLIENT_SECRET || "").trim();
  if (devId && devSecret && devId !== "replace-with-naver-client-id") return { kind: "developers", clientId: devId, clientSecret: devSecret };
  return null;
}

export function buildNaverSearchRequest(provider: NaverSearchProvider, kind: SearchKind, query: string): { url: string; headers: Record<string, string> } {
  const q = encodeURIComponent(query);
  return provider.kind === "hub"
    ? {
        url: `https://naverapihub.apigw.ntruss.com/search/v1/${kind}?query=${q}&display=20`,
        headers: { "X-NCP-APIGW-API-KEY-ID": provider.clientId, "X-NCP-APIGW-API-KEY": provider.clientSecret }
      }
    : {
        url: `https://openapi.naver.com/v1/search/${kind}.json?query=${q}&display=20`,
        headers: { "X-Naver-Client-Id": provider.clientId, "X-Naver-Client-Secret": provider.clientSecret }
      };
}

async function searchNaver(provider: NaverSearchProvider, kind: SearchKind, query: string): Promise<InstagramSearchDocument[]> {
  const request = buildNaverSearchRequest(provider, kind, query);
  const response = await fetch(request.url, { headers: request.headers, cache: "no-store", signal: AbortSignal.timeout(6000) });
  // 401·403은 대개 HUB 앱에 이 검색(블로그·웹문서)을 선택하지 않은 경우 — 키 값은 남기지 않고 상태만 남긴다.
  if (!response.ok) throw new Error(`naver ${provider.kind} ${kind} ${response.status}`);
  const payload = (await response.json()) as { items?: Array<{ title?: string; description?: string; link?: string }> };
  return (payload.items || []).map((item) => ({
    title: item.title || "",
    description: item.description || "",
    link: item.link || "",
    source: kind === "blog" ? "blog" : "web"
  }));
}

export async function discoverInstagramCandidates(lead: InstagramDiscoveryLead): Promise<InstagramDiscoveryResult> {
  const queries = buildInstagramDiscoveryQueries(lead);
  const provider = resolveNaverSearchProvider();
  if (!provider) {
    return { ok: false, reason: "not_configured", message: "네이버 검색 API 키가 없어 자동 후보 찾기를 할 수 없습니다. 아래 검색 버튼을 이용해 주세요.", queries };
  }
  const settled = await Promise.allSettled(
    queries.slice(0, 2).flatMap((query) => [searchNaver(provider, "webkr", query), searchNaver(provider, "blog", query)])
  );
  const documents = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  if (!documents.length && settled.every((result) => result.status === "rejected")) {
    const first = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    console.warn("[instagram-discovery] naver search failed", first?.reason instanceof Error ? first.reason.message : "unknown");
    return { ok: false, reason: "search_failed", message: "네이버 검색에 실패했습니다. 잠시 뒤 다시 시도해 주세요.", queries };
  }
  return { ok: true, candidates: rankInstagramCandidates(lead, documents), queries, documentCount: documents.length };
}
