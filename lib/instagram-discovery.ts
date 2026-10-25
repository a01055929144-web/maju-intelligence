// 네이버 공식 검색 API(웹문서·블로그)로 인스타그램 아이디 후보를 찾는 인프라 코드입니다.
// 규칙(검색어·추출·점수)은 domains/lead/instagram-discovery.ts에 있고, 여기서는 호출만 합니다.
// 인스타그램 페이지를 직접 긁지 않습니다(약관). 키: NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET.

import {
  buildInstagramDiscoveryQueries,
  type InstagramCandidate,
  type InstagramDiscoveryLead,
  type InstagramSearchDocument,
  rankInstagramCandidates
} from "@/domains/lead/instagram-discovery";

export type InstagramDiscoveryResult =
  | { ok: true; candidates: InstagramCandidate[]; queries: string[]; documentCount: number }
  | { ok: false; reason: "not_configured" | "search_failed"; message: string; queries: string[] };

async function searchNaver(kind: "webkr" | "blog", query: string, clientId: string, clientSecret: string): Promise<InstagramSearchDocument[]> {
  const response = await fetch(`https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(query)}&display=20`, {
    headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
    cache: "no-store",
    signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) throw new Error(`naver ${kind} ${response.status}`);
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
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret || clientId === "replace-with-naver-client-id") {
    return { ok: false, reason: "not_configured", message: "네이버 검색 API 키가 없어 자동 후보 찾기를 할 수 없습니다. 아래 검색 버튼을 이용해 주세요.", queries };
  }
  const settled = await Promise.allSettled(
    queries.slice(0, 2).flatMap((query) => [searchNaver("webkr", query, clientId, clientSecret), searchNaver("blog", query, clientId, clientSecret)])
  );
  const documents = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  if (!documents.length && settled.every((result) => result.status === "rejected")) {
    return { ok: false, reason: "search_failed", message: "네이버 검색에 실패했습니다. 잠시 뒤 다시 시도해 주세요.", queries };
  }
  return { ok: true, candidates: rankInstagramCandidates(lead, documents), queries, documentCount: documents.length };
}
