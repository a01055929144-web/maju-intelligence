/**
 * 리뷰 텍스트를 규칙 기반(빈도 분석)으로 요약·키워드화하는 공용 로직입니다. 별도 LLM API 키 없이
 * 동작하며, 두 군데에서 재사용됩니다: (1) lib/google-reviews.ts — 구글 Places API로 가져온 리뷰,
 * (2) lib/store.ts의 summarizeCustomerReviewText() — 담당자가 네이버·카카오 리뷰를 직접 읽고
 * 복사해서 붙여넣은 텍스트. 두 경우 모두 "실제 리뷰 텍스트가 입력으로 주어졌을 때"만 동작하고,
 * 이 모듈 스스로 어떤 URL을 가져오거나 열람하지 않습니다 — 자동 수집(fetch)은 구글 공식 API를 통해
 * 서버가 직접 요청하는 경우로만 한정되고, 네이버·카카오는 항상 사람이 먼저 읽고 붙여넣은 텍스트만
 * 다룹니다(리뷰_자동수집_파이프라인_설계.md 참고 — map.naver.com 등은 자동 접근 대상이 아닙니다).
 */

// 한국어 리뷰 텍스트에서 의미 있는 키워드를 뽑아내기 위한 최소 불용어 목록입니다. 완벽한
// 형태소 분석은 아니지만, LLM 호출 없이도 "가성비", "친절", "재방문" 같은 실제로 반복되는
// 단어를 상위로 끌어올리기에는 충분합니다.
const REVIEW_STOPWORDS = new Set([
  "정말", "진짜", "너무", "그리고", "그런데", "하지만", "여기", "저기", "이곳", "정도", "조금",
  "완전", "엄청", "그냥", "아주", "매우", "같아요", "같습니다", "했어요", "입니다", "있어요",
  "없어요", "좋아요", "좋았어요", "였어요", "합니다", "해서", "에서", "에게", "으로", "까지",
  "부터", "한테", "그래서", "이것", "저것", "우리", "제가", "저는", "제일", "오늘", "다음",
  "자주", "항상", "계속", "그리고요", "근데", "이번", "지난번", "사장님", "직원분", "직원분들"
]);

export function tokenizeReviewText(text: string): string[] {
  return text
    .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !REVIEW_STOPWORDS.has(token));
}

export function extractReviewKeywords(texts: string[], limit = 5): string[] {
  const frequency = new Map<string, number>();
  for (const text of texts) {
    // 리뷰 하나당 토큰을 한 번씩만 세어(Set), 리뷰 하나가 길다고 그 안의 단어가 과대 반영되지
    // 않도록 합니다 — 실제로 "여러 리뷰에 걸쳐 반복되는" 단어를 우선합니다.
    const uniqueTokens = Array.from(new Set(tokenizeReviewText(text || "")));
    for (const token of uniqueTokens) {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    }
  }

  const sorted = Array.from(frequency.entries()).sort((a, b) => b[1] - a[1]);
  // 리뷰가 3건 이상이면 최소 2건 이상에서 등장한 단어만 채택해 우연히 한 번 나온 단어를 거릅니다.
  const filtered = texts.length >= 3 ? sorted.filter(([, count]) => count >= 2) : sorted;
  return (filtered.length ? filtered : sorted).slice(0, limit).map(([token]) => token);
}

export function buildReviewSummary(texts: string[], leadLine?: string): string {
  const parts: string[] = [];
  if (leadLine) parts.push(leadLine);
  const best = [...texts].sort((a, b) => (b?.length || 0) - (a?.length || 0))[0];
  if (best) {
    const normalized = best.trim().replace(/\s+/g, " ");
    const snippet = normalized.slice(0, 140);
    parts.push(`리뷰 예시: "${snippet}${normalized.length > 140 ? "…" : ""}"`);
  }
  return parts.join(" · ");
}

/**
 * 담당자가 네이버플레이스·카카오맵 등에서 직접 읽고 복사해 붙여넣은 리뷰 원문(여러 건이 한 번에
 * 붙여넣어졌을 수 있음)을 리뷰 단위로 나눕니다. 빈 줄로 구분돼 있으면 그 기준으로, 아니면 한 줄씩
 * 리뷰로 보이면 줄 단위로, 둘 다 아니면 전체를 리뷰 한 건으로 취급합니다.
 */
export function splitPastedReviewText(rawText: string): string[] {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const byBlankLine = normalized
    .split(/\n\s*\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;

  const byLine = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 8);
  return byLine.length >= 2 ? byLine : [normalized];
}

export function summarizePastedReviewText(rawText: string): { summary: string; keywords: string[] } | null {
  const chunks = splitPastedReviewText(rawText);
  if (!chunks.length) return null;
  return {
    summary: buildReviewSummary(chunks),
    keywords: extractReviewKeywords(chunks)
  };
}
