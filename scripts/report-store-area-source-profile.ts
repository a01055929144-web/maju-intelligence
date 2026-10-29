import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
// Node 24의 strip-types 실행은 ESM 상대 경로에 확장자가 필요합니다. 저장소 tsc는 noEmit 검사용이라
// 이 실행 전용 스크립트만 명시적 .ts 경로를 사용합니다.
// @ts-expect-error allowImportingTsExtensions는 실행 스크립트에만 필요한 Node 런타임 제약입니다.
import { profileStoreAreaSource, type StoreAreaSourceProfile, type StoreAreaSourceRow } from "../domains/lead/store-area-source-profile.ts";

const GOV_DATASETS = ["general_restaurants", "rest_cafes", "bakeries", "group_meal_facilities", "contract_catering"] as const;
const GOV_AREAS = [
  { code: "3220000", label: "서울특별시 강남구" },
  { code: "3130000", label: "서울특별시 마포구" },
  { code: "3230000", label: "서울특별시 송파구" },
  { code: "3330000", label: "부산광역시 해운대구" },
  { code: "3470000", label: "대구광역시 달서구" },
  { code: "3530000", label: "인천광역시 남동구" }
] as const;
const GOV_PAGE_SIZE = 100;
const SEOUL_SERVICE = "LOCALDATA_072404";

type SourceResult = {
  caveat: string;
  estimateOmissionReason?: string;
  label: string;
  minimumIndustrySample: number;
  populationLabel: string;
  profile: StoreAreaSourceProfile;
  sampledStrata: number;
};

function pick(row: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

async function fetchJson(url: URL | string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`원천 API 응답 실패(${response.status})`);
  return response.json() as Promise<Record<string, unknown>>;
}

async function fetchGovProfile(): Promise<SourceResult> {
  const apiKey = process.env.GOV_RESTAURANT_API_KEY?.trim();
  if (!apiKey) throw new Error("GOV_RESTAURANT_API_KEY가 없어 정부 원천을 읽을 수 없습니다.");
  const rows: StoreAreaSourceRow[] = [];
  let selectedPopulation = 0;
  let sampledStrata = 0;

  for (const area of GOV_AREAS) {
    for (const dataset of GOV_DATASETS) {
      const url = new URL(`https://apis.data.go.kr/1741000/${dataset}/info`);
      url.searchParams.set("serviceKey", apiKey);
      url.searchParams.set("pageNo", "1");
      url.searchParams.set("numOfRows", String(GOV_PAGE_SIZE));
      url.searchParams.set("type", "json");
      url.searchParams.set("cond[OPN_ATMY_GRP_CD::EQ]", area.code);
      const data = await fetchJson(url) as {
        response?: { body?: { items?: { item?: Record<string, unknown>[] }; totalCount?: number }; header?: { resultCode?: string } };
      };
      const resultCode = String(data.response?.header?.resultCode || "");
      if (resultCode && !/^0+$/.test(resultCode)) throw new Error(`정부 원천 결과 코드 오류(${resultCode})`);
      const body = data.response?.body;
      const sourceRows = body?.items?.item || [];
      selectedPopulation += Number(body?.totalCount || 0);
      sampledStrata += 1;
      rows.push(...sourceRows.map((row) => ({
        areaRaw: pick(row, ["LCTN_AREA"]),
        industry: String(pick(row, ["BZSTAT_SE_NM", "SNTTN_BZSTAT_NM"]) || "미분류"),
        source: `gov:${dataset}:${area.label}`
      })));
    }
  }

  return {
    caveat: "선정 6개 시군구 × 5개 데이터셋의 최신 100건 표본이다. 최신순 편향이 있어 추정치는 방향성 참고값이며 전국 추정이 아니다.",
    label: "행정안전부 1741000 원천",
    minimumIndustrySample: 10,
    populationLabel: `선정 지역·데이터셋 원천 합계 ${selectedPopulation.toLocaleString("ko-KR")}건`,
    profile: profileStoreAreaSource(rows, { estimatedSourceRows: selectedPopulation, minimumIndustrySample: 10 }),
    sampledStrata
  };
}

async function fetchSeoulPage(apiKey: string, start: number, end: number) {
  if (apiKey !== "sample") {
    throw new Error("서울 API는 HTTPS 공식 엔드포인트가 확인되기 전까지 인증키 수집을 지원하지 않습니다.");
  }
  const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/${SEOUL_SERVICE}/${start}/${end}/`;
  const data = await fetchJson(url) as Record<string, { list_total_count?: number; row?: Record<string, unknown>[] }>;
  const body = data[SEOUL_SERVICE];
  if (!body) throw new Error("서울 원천 응답 본문이 없습니다.");
  return { rows: body.row || [], totalCount: Number(body.list_total_count || 0) };
}

async function fetchSeoulProfile(): Promise<SourceResult> {
  // 공식 문서는 HTTP :8088 예시만 제공하고 HTTPS 연결은 실패한다. 인증키를 평문 URL에
  // 포함하지 않도록 키 없는 sample 경로만 허용한다.
  const sample = await fetchSeoulPage("sample", 1, 5);
  const rows = sample.rows.map((row) => ({
    areaRaw: pick(row, ["SITEAREA"]),
    industry: String(pick(row, ["UPTAENM"]) || "미분류"),
    source: "seoul:official-sample"
  }));
  return {
    caveat: "서울시가 인증키 없이 제공하는 공식 샘플 5건이다. 표본이 극히 작아 모집단 외삽과 대표성 판단을 하지 않는다.",
    estimateOmissionReason: "모집단 크기는 확인했지만 표본이 5건뿐이라 외삽 추정치를 생성하지 않음.",
    label: "서울 열린데이터광장 일반음식점 원천(공식 샘플)",
    minimumIndustrySample: 1,
    populationLabel: `서울 원천 전체 ${sample.totalCount.toLocaleString("ko-KR")}건(표본 비율 외삽 금지)`,
    profile: profileStoreAreaSource(rows, { minimumIndustrySample: 1 }),
    sampledStrata: 1
  };
}

function formatNumber(value: number | undefined) {
  return value === undefined ? "-" : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function sourceSection(result: SourceResult) {
  const { actual, estimated } = result.profile;
  const industryRows = result.profile.byIndustry.slice(0, 20).map((row) =>
    `| ${row.industry.replaceAll("|", "\\|")} | ${row.sampledRows.toLocaleString("ko-KR")} | ${row.positiveRows.toLocaleString("ko-KR")} | ${formatNumber(row.medianSqm)} |`
  ).join("\n") || "| 표본 10건 이상 업종 없음 | - | - | - |";
  return `## ${result.label}

- 표본 층: ${result.sampledStrata.toLocaleString("ko-KR")}개
- 모집단 기준: ${result.populationLabel}
- 주의: ${result.caveat}

### 실제 관측값

| 지표 | 건수 | 비율 |
|---|---:|---:|
| 표본 전체 | ${actual.rows.toLocaleString("ko-KR")} | 100% |
| 빈값 | ${actual.blank.toLocaleString("ko-KR")} | ${actual.blankRate}% |
| 0㎡ | ${actual.zero.toLocaleString("ko-KR")} | ${actual.zeroRate}% |
| 유효 양수 | ${actual.positive.toLocaleString("ko-KR")} | ${actual.positiveRate}% |
| 유효 범위 밖·비숫자 | ${actual.invalid.toLocaleString("ko-KR")} | ${actual.invalidRate}% |

- 유효 양수 중앙값: ${formatNumber(actual.medianSqm)}㎡
- 최소 / 95백분위 / 최대: ${formatNumber(actual.minimumSqm)}㎡ / ${formatNumber(actual.p95Sqm)}㎡ / ${formatNumber(actual.maximumSqm)}㎡
- 상위 1% 이상 실제 관측 예시(최대 10개): ${actual.outlierExamples.length ? actual.outlierExamples.map((value) => `${formatNumber(value)}㎡`).join(", ") : "없음"}

### 추정값

${estimated ? `표본 비율을 위 모집단에 단순 외삽한 값이다. 실제 원천 집계가 아니며 표본 편향을 포함한다.

| 지표 | 추정 건수 |
|---|---:|
| 빈값 | 약 ${estimated.blank.toLocaleString("ko-KR")} |
| 0㎡ | 약 ${estimated.zero.toLocaleString("ko-KR")} |
| 유효 양수 | 약 ${estimated.positive.toLocaleString("ko-KR")} |
| 유효 범위 밖·비숫자 | 약 ${estimated.invalid.toLocaleString("ko-KR")} |` : result.estimateOmissionReason || "모집단 크기를 확인하지 못해 추정하지 않음."}

### 업종별 실제 관측 중앙값

표본에서 유효 면적이 ${result.minimumIndustrySample.toLocaleString("ko-KR")}건 이상인 업종만 표시한다.

| 업종 | 표본 전체 | 유효 면적 | 중앙값(㎡) |
|---|---:|---:|---:|
${industryRows}`;
}

async function main() {
  const outputArg = process.argv.find((value) => value.startsWith("--output="));
  const output = resolve(outputArg?.slice("--output=".length) || "docs/reports/2026-10-29-store-area-source-profile.md");
  const sampledAt = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "long",
    timeZone: "Asia/Seoul"
  }).format(new Date());
  const govConfigured = Boolean(process.env.GOV_RESTAURANT_API_KEY?.trim());
  const seoulPreviewEnabled = process.env.LEAD_SEOUL_SOURCE_ENABLED === "true";
  const results = await Promise.all([
    ...(govConfigured ? [fetchGovProfile()] : []),
    ...(seoulPreviewEnabled ? [fetchSeoulProfile()] : [])
  ]);
  const report = `# 매장 면적 원천 분포 읽기 전용 리포트

- 실행 시각: ${sampledAt}
- 기준 커밋: f0385c3
- 실행 방식: 외부 공공 원천 GET 요청만 사용. Supabase·운영 DB 읽기/쓰기 없음.
- 실제값: API 응답 표본에서 직접 관측한 값
- 추정값: 표본 비율을 원천이 알려준 모집단 건수에 단순 외삽한 값
- 이상치 기준: 음수, 비숫자, 100,000㎡ 초과는 유효 범위 밖으로 분류. 유효값 상위 1%는 별도 관측 예시로 표시.
- 미측정 원천: ${[
    ...(!govConfigured ? ["행정안전부 1741000 원천(API 키가 승인 환경에서만 복호화되어 이번 실행에서는 미측정)"] : []),
    ...(!seoulPreviewEnabled ? ["서울 열린데이터광장 원천(예비 플래그 기본 OFF로 미측정)"] : [])
  ].join(", ") || "없음"}
- 기본 수집 원천: 행정안전부 1741000 HTTPS API
- 보안 제한: 서울 API는 HTTPS 지원이 확인되지 않아 인증키 수집을 실행하지 않는다. 예비 플래그를 명시적으로 켠 수동 리포트에서도 키 없는 공식 sample 경로만 허용한다.
- 동일 매장 비교: 이번 외부 표본 실행은 두 원천의 공통 식별자를 보존하지 않아 미측정. 운영자 집계 API가 저장된 동일 lead_id 쌍만 집계하며 원문 행은 응답하지 않는다.

두 원천은 중복 행을 포함할 수 있어 합산하지 않는다.

${results.map(sourceSection).join("\n\n")}

## 해석 제한과 다음 단계

- 정부 원천 표본은 최신순 편향이 있으므로 전국 비율로 해석하지 않는다.
- 서울 공식 샘플은 원천 정렬에 따른 편향 가능성이 있다.
- 과거 코드에서 \`SEOUL_OPENDATA_API_KEY\`가 HTTP URL 경로에 포함된 실행 가능성이 있었다. 실제 노출을 확인한 것은 아니지만, 해당 경로를 운영에서 사용했다면 대표 승인으로 기존 키를 폐기·재발급할 것을 권고한다.
- 업종 중앙값은 면적 대체값을 생성하는 근거가 아니다. 실제 면적과 추정 면적은 저장·표시 단계에서도 구분해야 한다.
- 기능 플래그 활성화 전 제한된 테스트 회사에서 새 수집분의 분포를 재확인한다.
`;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, report, "utf8");
  console.log(`wrote ${output}`);
}

void main().catch((error) => {
  console.error("원천 분포 리포트 생성 실패", {
    errorName: error instanceof Error ? error.name : "UnknownError"
  });
  process.exitCode = 1;
});
