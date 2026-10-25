// 리드의 인스타그램 아이디 후보 찾기 규칙(2026-10-25). 순수 함수만 둡니다.
// 인스타그램에는 "상호로 계정 찾기" 공식 API가 없습니다. 그래서 네이버 공식 검색 API(웹문서·블로그)
// 결과에 들어 있는 instagram.com/아이디 링크·@아이디 언급을 모아 후보로 보여 주고,
// 사람이 프로필을 열어 확인한 뒤 저장합니다(자동 저장하지 않음 — 틀린 계정에 DM이 가는 것을 막기 위해).

const RESERVED_HANDLES = new Set([
  "p", "reel", "reels", "explore", "accounts", "stories", "direct", "tv", "about", "developer", "legal",
  "instagram", "share", "web", "tags", "locations", "challenge", "privacy", "help"
]);

const HANDLE_PATTERN = /^[A-Za-z0-9._]{2,30}$/;

export function isPlausibleInstagramHandle(handle: string): boolean {
  if (!HANDLE_PATTERN.test(handle)) return false;
  if (/^\.|\.$|\.\./.test(handle)) return false;
  if (/^\d+$/.test(handle)) return false;
  return !RESERVED_HANDLES.has(handle.toLowerCase());
}

/** 글(HTML 태그 포함 가능)에서 인스타그램 아이디 후보를 뽑습니다. */
export function extractInstagramHandlesFromText(text: string): string[] {
  const plain = String(text || "").replace(/<[^>]+>/g, " ");
  const found: string[] = [];
  for (const match of Array.from(plain.matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/gi))) found.push(match[1]);
  // "인스타 @아이디", "instagram: @아이디", "IG @아이디"처럼 인스타 언급 근처의 @아이디만 받습니다(이메일 오인 방지).
  for (const match of Array.from(plain.matchAll(/(?:인스타그램|인스타|instagram|insta|IG)\s*[:：]?\s*@([A-Za-z0-9._]{2,30})/gi))) found.push(match[1]);
  const unique: string[] = [];
  for (const raw of found) {
    const handle = raw.replace(/\.+$/, "");
    if (!isPlausibleInstagramHandle(handle)) continue;
    if (!unique.some((item) => item.toLowerCase() === handle.toLowerCase())) unique.push(handle);
  }
  return unique;
}

export type InstagramDiscoveryLead = { businessName: string; address?: string | null; industry?: string | null };

function regionTokens(address?: string | null): string[] {
  const tokens = String(address || "").split(/\s+/);
  // 광역시·도(서울특별시 등)보다 구·동이 동명 매장을 더 잘 가려 줍니다.
  const local = tokens.filter((token) => /(군|구|동|읍|면|가)$/.test(token) && !/(특별시|광역시|특별자치시)$/.test(token));
  const fallback = tokens.filter((token) => /시$/.test(token) && !/(특별시|광역시|특별자치시)$/.test(token));
  return (local.length ? local : fallback).slice(0, 2);
}

/** 검색어 후보. 상호에서 지점명·괄호를 떼고, 구·동 이름을 붙여 동명이점을 줄입니다. */
export function buildInstagramDiscoveryQueries(lead: InstagramDiscoveryLead): string[] {
  const name = lead.businessName.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  const region = regionTokens(lead.address).join(" ");
  const queries = [`${name} ${region} 인스타`.trim(), `"${name}" 인스타그램`, `${name} instagram`];
  return Array.from(new Set(queries.map((query) => query.replace(/\s+/g, " ").trim())));
}

export type InstagramSearchDocument = { title: string; description: string; link: string; source: "web" | "blog" };

export type InstagramCandidate = {
  handle: string;
  score: number;
  mentions: number;
  nameMatched: boolean;
  regionMatched: boolean;
  evidence: { title: string; link: string; source: "web" | "blog" }[];
};

function compact(text: string) {
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, "").toLowerCase();
}

/**
 * 검색 문서들에서 후보를 모아 점수를 매깁니다.
 * 점수: 언급 1건당 10점(최대 40) + 같은 문서에 상호가 있으면 30 + 지역명이 있으면 15 + 인스타 프로필 링크 자체면 15.
 */
export function rankInstagramCandidates(lead: InstagramDiscoveryLead, documents: InstagramSearchDocument[], limit = 5): InstagramCandidate[] {
  const nameKey = compact(lead.businessName.replace(/\(.*?\)/g, ""));
  const regions = regionTokens(lead.address).map((token) => compact(token));
  const byHandle = new Map<string, InstagramCandidate & { profileLink: boolean }>();
  for (const document of documents) {
    const text = `${document.title} ${document.description} ${document.link}`;
    const handles = extractInstagramHandlesFromText(text);
    if (!handles.length) continue;
    const docKey = compact(`${document.title} ${document.description}`);
    const nameMatched = Boolean(nameKey) && docKey.includes(nameKey);
    const regionMatched = regions.some((region) => region && docKey.includes(region));
    const isProfileLink = /instagram\.com\/[A-Za-z0-9._]+\/?$/i.test(document.link);
    for (const handle of handles) {
      const key = handle.toLowerCase();
      const current = byHandle.get(key) || { handle, score: 0, mentions: 0, nameMatched: false, regionMatched: false, evidence: [], profileLink: false };
      current.mentions += 1;
      current.nameMatched ||= nameMatched;
      current.regionMatched ||= regionMatched;
      current.profileLink ||= isProfileLink;
      if (current.evidence.length < 3) current.evidence.push({ title: document.title.replace(/<[^>]+>/g, "").slice(0, 80), link: document.link, source: document.source });
      byHandle.set(key, current);
    }
  }
  return Array.from(byHandle.values())
    .map(({ profileLink, ...candidate }) => ({
      ...candidate,
      score: Math.min(40, candidate.mentions * 10) + (candidate.nameMatched ? 30 : 0) + (candidate.regionMatched ? 15 : 0) + (profileLink ? 15 : 0)
    }))
    .filter((candidate) => candidate.nameMatched || candidate.mentions >= 2)
    .sort((a, b) => b.score - a.score || b.mentions - a.mentions)
    .slice(0, limit);
}
