type Result<T> = { items: T[]; status: "ready" | "missing" | "error"; message: string };

export type MarketPrice = { name: string; variety: string; unit: string; grade: string; price: string; date: string };
export type NearbyEvent = { id: string; title: string; address: string; from: string; to: string };

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  return value && typeof value === "object" ? [value as Record<string, unknown>] : [];
}

function label(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function parseKamisPrices(body: unknown): MarketPrice[] {
  const data = (body as { data?: { item?: unknown } } | null)?.data;
  return records(data?.item).map((item) => ({
    name: label(item.item_name), variety: label(item.kind_name), unit: label(item.unit),
    grade: label(item.rank), price: label(item.dpr1), date: label(item.day1)
  })).filter((item) => item.name && item.price && item.price !== "-");
}

export function parseTourEvents(body: unknown): NearbyEvent[] {
  const response = (body as { response?: { header?: { resultCode?: unknown }; body?: { items?: { item?: unknown } } } } | null)?.response;
  if (response?.header?.resultCode && !["0", "0000"].includes(label(response.header.resultCode))) return [];
  return records(response?.body?.items?.item).map((item) => ({
    id: label(item.contentid), title: label(item.title), address: label(item.addr1),
    from: label(item.eventstartdate), to: label(item.eventenddate)
  })).filter((item) => item.id && item.title);
}

export function kstDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value || "").join("");
}

async function readJson(url: URL): Promise<unknown> {
  const response = await fetch(url, { next: { revalidate: 86_400 }, redirect: "error", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("기관 응답 실패");
  return response.json();
}

export async function readKamisPrices(category: string): Promise<Result<MarketPrice>> {
  const key = process.env.KAMIS_CERT_KEY;
  const id = process.env.KAMIS_CERT_ID;
  if (!key || !id) return { items: [], status: "missing", message: "KAMIS 인증 정보를 설정하면 참고 가격을 볼 수 있습니다." };
  try {
    const url = new URL("https://www.kamis.or.kr/service/price/xml.do");
    url.search = new URLSearchParams({ action: "dailyPriceByCategoryList", p_cert_key: key, p_cert_id: id,
      p_returntype: "json", p_product_cls_code: "02", p_item_category_code: category, p_country_code: "1101" }).toString();
    const items = parseKamisPrices(await readJson(url));
    return { items: items.slice(0, 50), status: "ready", message: items.length ? "서울 도매 참고 가격입니다." : "조회된 가격이 없습니다. KAMIS 이용 권한과 조사일을 확인해 주세요." };
  } catch {
    return { items: [], status: "error", message: "KAMIS 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function readTourEvents(): Promise<Result<NearbyEvent>> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) return { items: [], status: "missing", message: "공공데이터포털 인증 정보를 설정하면 행사 일정을 볼 수 있습니다." };
  try {
    const start = kstDateKey(new Date());
    const url = new URL("https://apis.data.go.kr/B551011/KorService2/searchFestival2");
    url.search = new URLSearchParams({ serviceKey: key, MobileOS: "ETC", MobileApp: "MAJU", _type: "json",
      numOfRows: "20", pageNo: "1", eventStartDate: start }).toString();
    const body = await readJson(url);
    const code = label((body as { response?: { header?: { resultCode?: unknown } } })?.response?.header?.resultCode);
    if (code && !["0", "0000"].includes(code)) throw new Error("기관 응답 실패");
    const items = parseTourEvents(body);
    return { items, status: "ready", message: items.length ? "진행 예정 행사입니다. 실제 영향은 확인 후 판단하세요." : "조회된 행사가 없습니다. 관광공사 이용 권한을 확인해 주세요." };
  } catch {
    return { items: [], status: "error", message: "행사 자료를 불러오지 못했습니다. 이용 승인 상태를 확인해 주세요." };
  }
}

