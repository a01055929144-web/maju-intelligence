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

export function isBusinessStatusApiConfigured() {
  const key = process.env.NTS_BUSINESS_API_KEY;
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

async function fetchStatusBatch(businessNumbers: string[]): Promise<NtsStatusRow[]> {
  const serviceKey = process.env.NTS_BUSINESS_API_KEY || "";

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

    if (!response.ok) return [];
    const payload = (await response.json()) as { status_code?: string; data?: NtsStatusRow[] };
    if (payload.status_code !== "OK") return [];
    return payload.data || [];
  } catch {
    return [];
  }
}

/**
 * Looks up 계속사업자/휴업자/폐업자 status for a batch of 사업자등록번호. Never throws — returns
 * an empty map when the API key isn't configured, the input is empty, or every request fails.
 * Numbers the API has no record for (invalid or not found) are simply absent from the result map,
 * which callers should treat as "확인 필요" rather than assuming any particular status.
 */
export async function checkBusinessRegistrationStatuses(businessNumbers: string[]): Promise<Map<string, BusinessStatusResult>> {
  const results = new Map<string, BusinessStatusResult>();
  if (!isBusinessStatusApiConfigured()) return results;

  const uniqueNumbers = Array.from(new Set(businessNumbers.map(normalizeBusinessNumberDigits).filter((value) => value.length === 10)));
  if (!uniqueNumbers.length) return results;

  const batches: string[][] = [];
  for (let index = 0; index < uniqueNumbers.length; index += BATCH_SIZE) {
    batches.push(uniqueNumbers.slice(index, index + BATCH_SIZE));
  }

  const batchResults = await Promise.all(batches.map((batch) => fetchStatusBatch(batch)));
  for (const row of batchResults.flat()) {
    if (!row.b_no) continue;
    results.set(row.b_no, {
      label: mapStatusLabel(row.b_stt_cd),
      rawStatus: row.b_stt || "",
      statusCode: row.b_stt_cd || "",
      closedDate: row.end_dt || null
    });
  }

  return results;
}
