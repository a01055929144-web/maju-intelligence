/**
 * Automated 휴업/폐업 (business closure) status checking via the National Tax Service's public
 * "사업자등록정보 진위확인 및 상태조회" API (data.go.kr / api.odcloud.kr). Mirrors the
 * graceful-degradation pattern used in lib/leads.ts and lib/place-links.ts for optional external
 * API keys: every function here returns an empty/safe result instead of throwing when the API key
 * is missing or a request fails, so callers never need special-case error handling.
 */

export type BusinessStatusLabel = "정상" | "휴업" | "폐업" | "확인 필요";

export type BusinessStatusResult = {
  label: BusinessStatusLabel;
  rawStatus: string;
  statusCode: string;
  closedDate: string | null;
};

const NTS_BUSINESS_STATUS_URL = "https://api.odcloud.kr/api/nts-businessman/v1/status";
// The API accepts up to 100 business numbers per call; batching at 90 leaves headroom.
const BATCH_SIZE = 90;

function getBusinessStatusApiKey() {
  return (process.env.NTS_BUSINESS_API_KEY || process.env.NTS_BUSINESS_SERVICE_KEY || "").trim();
}

export function isBusinessStatusApiConfigured() {
  const key = getBusinessStatusApiKey();
  return Boolean(key && key !== "replace-with-data-go-kr-service-key");
}

function normalizeBusinessNumberDigits(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function mapStatusLabel(statusCode: string | undefined): BusinessStatusLabel {
  if (statusCode === "01") return "정상";
  if (statusCode === "02") return "휴업";
  if (statusCode === "03") return "폐업";
  return "확인 필요";
}

type NtsStatusRow = {
  b_no?: string;
  b_stt?: string;
  b_stt_cd?: string;
  end_dt?: string;
};

type NtsStatusPayload = {
  data?: NtsStatusRow[];
  match_cnt?: number;
  request_cnt?: number;
  status_code?: string;
};

// 2026-08-28 피드백 대응(국세청 API 장애 시 "정상 조회됨"으로 보임): 예전에는 요청 실패(네트워크
// 오류, HTTP 오류, status_code 이상)와 "정상 응답했지만 매칭되는 사업자가 없음"을 똑같이 빈 배열로
// 돌려줘서 구분할 수 없었습니다. 이제 { ok, rows }로 감싸 호출부(checkBusinessRegistrationStatusesWithHealth)가
// "이 번호들은 조회 자체가 실패했다"를 알 수 있게 합니다.
async function fetchStatusBatch(businessNumbers: string[]): Promise<{ ok: boolean; rows: NtsStatusRow[] }> {
  const serviceKey = getBusinessStatusApiKey();
  if (!serviceKey) return { ok: false, rows: [] };

  try {
    const response = await fetch(`${NTS_BUSINESS_STATUS_URL}?serviceKey=${encodeURIComponent(serviceKey)}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ b_no: businessNumbers }),
      cache: "no-store"
    });

    if (!response.ok) return { ok: false, rows: [] };
    const payload = (await response.json()) as NtsStatusPayload;
    const statusCode = String(payload.status_code || "").toUpperCase();
    if (statusCode && statusCode !== "OK" && statusCode !== "200") return { ok: false, rows: [] };
    return { ok: true, rows: Array.isArray(payload.data) ? payload.data : [] };
  } catch {
    return { ok: false, rows: [] };
  }
}

/**
 * Looks up 계속사업자/휴업자/폐업자 status for a batch of 사업자등록번호. Never throws — returns
 * an empty map when the API key isn't configured, the input is empty, or every request fails.
 * Numbers the API has no record for (invalid or not found) are simply absent from the result map,
 * which callers should treat as "확인 필요" rather than assuming any particular status.
 */
export async function checkBusinessRegistrationStatuses(businessNumbers: string[]): Promise<Map<string, BusinessStatusResult>> {
  const { results } = await checkBusinessRegistrationStatusesWithHealth(businessNumbers);
  return results;
}

/**
 * checkBusinessRegistrationStatuses와 동일하게 동작하지만, 조회 자체가 실패한(네트워크 오류·HTTP
 * 오류·API 상태코드 이상) 사업자번호를 failedNumbers에 별도로 담아 돌려줍니다. 호출부(예:
 * refreshCustomerBusinessStatuses)가 "매칭되는 상태가 없어서 확인 필요" 와 "장애로 조회를 못해서
 * 원래 상태를 그대로 둬야 함"을 구분하는 데 씁니다. 2026-08-28 피드백 대응.
 */
export async function checkBusinessRegistrationStatusesWithHealth(
  businessNumbers: string[]
): Promise<{ results: Map<string, BusinessStatusResult>; failedNumbers: Set<string> }> {
  const results = new Map<string, BusinessStatusResult>();
  const failedNumbers = new Set<string>();
  if (!isBusinessStatusApiConfigured()) return { results, failedNumbers };

  const uniqueNumbers = Array.from(new Set(businessNumbers.map(normalizeBusinessNumberDigits).filter((value) => value.length === 10)));
  if (!uniqueNumbers.length) return { results, failedNumbers };

  const batches: string[][] = [];
  for (let index = 0; index < uniqueNumbers.length; index += BATCH_SIZE) {
    batches.push(uniqueNumbers.slice(index, index + BATCH_SIZE));
  }

  const batchResults = await Promise.all(batches.map((batch) => fetchStatusBatch(batch).then((result) => ({ batch, result }))));
  for (const { batch, result } of batchResults) {
    if (!result.ok) {
      batch.forEach((number) => failedNumbers.add(number));
      continue;
    }
    for (const row of result.rows) {
      if (!row.b_no) continue;
      results.set(row.b_no, {
        label: mapStatusLabel(row.b_stt_cd),
        rawStatus: row.b_stt || "",
        statusCode: row.b_stt_cd || "",
        closedDate: row.end_dt || null
      });
    }
  }

  return { results, failedNumbers };
}
