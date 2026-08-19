/**
 * 네이버 데이터랩 "검색어 트렌드" API로 거래처명 키워드 검색량을 상대 지수로 가져옵니다
 * (영업리드 정렬용, 2026-08-20 피드백: "영업리드 > 키워드 검색량 순으로 진행").
 *
 * 다른 선택형 외부 API들(lib/google-reviews.ts, lib/business-status.ts)과 같은
 * graceful-degradation 패턴을 따릅니다: 키가 없거나 요청이 실패해도 절대 throw하지 않고
 * 빈 결과를 돌려주므로, 호출하는 쪽은 별도 에러 처리 없이 항상 안전하게 호출할 수 있습니다.
 *
 * 데이터랩 API는 절대 검색량이 아니라 "구간 내 최고점을 100으로 둔 상대 지수"를 돌려주고,
 * 이 상대 지수는 같은 API 호출(keywordGroups) 안에서만 서로 비교 가능합니다. 여러 번 나눠 호출한
 * 값끼리는 그대로 비교할 수 없어서, 매 호출마다 고정 앵커 키워드("커피")를 하나씩 같이 넣고
 * 그 값으로 나눠 정규화합니다 — 호출 배치가 달라도 대략 같은 기준으로 비교할 수 있게 하기 위함입니다.
 * 완벽한 절대값은 아니지만(네이버 검색광고 API의 월간 검색량과 달리), 정렬 용도로는 충분합니다.
 */

const DATALAB_SEARCH_URL = "https://openapi.naver.com/v1/datalab/search";
const ANCHOR_KEYWORD = "커피";
const MAX_KEYWORDS_PER_GROUP_CALL = 4; // 앵커 1개 + 거래처명 4개 = 데이터랩 최대 5그룹

function getNaverClientId() {
  return (process.env.NAVER_CLIENT_ID || "").trim();
}

function getNaverClientSecret() {
  return (process.env.NAVER_CLIENT_SECRET || "").trim();
}

export function isNaverDatalabConfigured() {
  return Boolean(getNaverClientId() && getNaverClientSecret());
}

type DatalabResponsePoint = { period: string; ratio: number };
type DatalabResponseGroup = { title: string; keywords: string[]; data: DatalabResponsePoint[] };
type DatalabResponse = { startDate: string; endDate: string; timeUnit: string; results: DatalabResponseGroup[] };

function averageRatio(points: DatalabResponsePoint[] | undefined): number {
  if (!points || !points.length) return 0;
  const sum = points.reduce((total, point) => total + (Number.isFinite(point.ratio) ? point.ratio : 0), 0);
  return sum / points.length;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * 거래처명 목록(최대 개수 제한 없음, 내부에서 4개씩 배치로 나눠 호출)을 받아
 * { 거래처명: 정규화된 검색량 지수(0 이상, 앵커="커피" 기준 100) } 형태로 돌려줍니다.
 * 조회에 실패한 이름은 결과 맵에서 아예 빠집니다(호출하는 쪽에서 "미확인"으로 처리).
 */
export async function fetchKeywordVolumeScores(names: string[]): Promise<Record<string, number>> {
  const clientId = getNaverClientId();
  const clientSecret = getNaverClientSecret();
  if (!clientId || !clientSecret) return {};

  const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  if (!uniqueNames.length) return {};

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 90);

  const scores: Record<string, number> = {};

  for (let index = 0; index < uniqueNames.length; index += MAX_KEYWORDS_PER_GROUP_CALL) {
    const batch = uniqueNames.slice(index, index + MAX_KEYWORDS_PER_GROUP_CALL);
    const keywordGroups = [
      { groupName: ANCHOR_KEYWORD, keywords: [ANCHOR_KEYWORD] },
      ...batch.map((name) => ({ groupName: name, keywords: [name] }))
    ];

    try {
      const response = await fetch(DATALAB_SEARCH_URL, {
        method: "POST",
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          timeUnit: "week",
          keywordGroups
        }),
        cache: "no-store"
      });
      if (!response.ok) continue;

      const payload = (await response.json().catch(() => null)) as DatalabResponse | null;
      if (!payload?.results?.length) continue;

      const anchorGroup = payload.results.find((group) => group.title === ANCHOR_KEYWORD);
      const anchorAverage = averageRatio(anchorGroup?.data);
      if (!anchorAverage) continue; // 앵커 값이 0이면 정규화 기준을 잡을 수 없어 이 배치는 건너뜁니다.

      payload.results.forEach((group) => {
        if (group.title === ANCHOR_KEYWORD) return;
        const groupAverage = averageRatio(group.data);
        scores[group.title] = Math.round((groupAverage / anchorAverage) * 100);
      });
    } catch {
      // 이 배치만 건너뛰고 나머지 배치는 계속 시도합니다.
    }
  }

  return scores;
}
