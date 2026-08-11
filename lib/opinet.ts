export type OpinetFuelPrice = {
  basis: "opinet" | "fallback";
  checkedAt: string;
  fuelType: "gasoline" | "diesel";
  pricePerLiter: number;
  sourceLabel: string;
};

type OpinetAveragePriceRow = {
  PRICE?: number | string;
  PRODCD?: string;
  PROD_NM?: string;
  TRADE_DT?: string;
};

type OpinetAveragePriceResponse = {
  RESULT?: {
    OIL?: OpinetAveragePriceRow[] | OpinetAveragePriceRow;
  };
};

const OPINET_BASE_URL = "https://www.opinet.co.kr/api";
const FALLBACK_DIESEL_PRICE = 1650;
const FALLBACK_GASOLINE_PRICE = 1720;

export async function getOpinetAverageFuelPrice(fuelType: "gasoline" | "diesel" = "diesel"): Promise<OpinetFuelPrice> {
  const apiKey = process.env.OPINET_API_KEY?.trim();

  if (!apiKey || apiKey === "replace-with-opinet-api-key") {
    return fallbackFuelPrice(fuelType);
  }

  try {
    const url = new URL(`${OPINET_BASE_URL}/avgAllPrice.do`);
    url.searchParams.set("out", "json");
    url.searchParams.set("code", apiKey);

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return fallbackFuelPrice(fuelType);

    const payload = (await response.json()) as OpinetAveragePriceResponse;
    const rows = normalizeRows(payload.RESULT?.OIL);
    const targetCode = fuelType === "diesel" ? "D047" : "B027";
    const targetName = fuelType === "diesel" ? "경유" : "휘발유";
    const row = rows.find((item) => item.PRODCD === targetCode) || rows.find((item) => item.PROD_NM?.includes(targetName));
    const price = Number(row?.PRICE || 0);

    if (!Number.isFinite(price) || price <= 0) return fallbackFuelPrice(fuelType);

    return {
      basis: "opinet",
      checkedAt: row?.TRADE_DT || new Date().toISOString(),
      fuelType,
      pricePerLiter: Math.round(price),
      sourceLabel: `OPINET 전국 평균 ${targetName}`
    };
  } catch {
    return fallbackFuelPrice(fuelType);
  }
}

export function estimateFuelCostWon(distanceKm: number, pricePerLiter: number, mileageKmPerLiter = 7.5) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  if (!Number.isFinite(pricePerLiter) || pricePerLiter <= 0) return 0;
  if (!Number.isFinite(mileageKmPerLiter) || mileageKmPerLiter <= 0) return 0;

  return Math.round((distanceKm / mileageKmPerLiter) * pricePerLiter);
}

function fallbackFuelPrice(fuelType: "gasoline" | "diesel"): OpinetFuelPrice {
  const isDiesel = fuelType === "diesel";

  return {
    basis: "fallback",
    checkedAt: new Date().toISOString(),
    fuelType,
    pricePerLiter: isDiesel ? FALLBACK_DIESEL_PRICE : FALLBACK_GASOLINE_PRICE,
    sourceLabel: isDiesel ? "기본 경유 단가" : "기본 휘발유 단가"
  };
}

function normalizeRows(rows: OpinetAveragePriceRow[] | OpinetAveragePriceRow | undefined) {
  if (!rows) return [];
  return Array.isArray(rows) ? rows : [rows];
}
