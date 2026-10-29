export const STORE_AREA_MAX_VALID_SQM = 100_000;

export type StoreAreaSourceRow = {
  areaRaw: unknown;
  industry?: string;
  source: string;
};

export type StoreAreaSourceProfile = {
  actual: {
    blank: number;
    blankRate: number;
    invalid: number;
    invalidRate: number;
    maximumSqm?: number;
    medianSqm?: number;
    minimumSqm?: number;
    outlierExamples: number[];
    p95Sqm?: number;
    positive: number;
    positiveRate: number;
    rows: number;
    zero: number;
    zeroRate: number;
  };
  byIndustry: Array<{
    industry: string;
    medianSqm: number;
    positiveRows: number;
    sampledRows: number;
  }>;
  estimated?: {
    blank: number;
    invalid: number;
    positive: number;
    sourceRows: number;
    zero: number;
  };
};

function round(value: number, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function median(values: readonly number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: readonly number[], ratio: number) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export function parseRawStoreArea(value: unknown): { kind: "blank" | "invalid" | "positive" | "zero"; value?: number } {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return { kind: "blank" };
  const normalized = typeof value === "string" ? value.replaceAll(",", "").trim() : value;
  const numeric = typeof normalized === "number" ? normalized : Number(normalized);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > STORE_AREA_MAX_VALID_SQM) {
    return { kind: "invalid", value: Number.isFinite(numeric) ? numeric : undefined };
  }
  if (numeric === 0) return { kind: "zero", value: 0 };
  return { kind: "positive", value: round(numeric) };
}

export function profileStoreAreaSource(
  rows: readonly StoreAreaSourceRow[],
  options: { estimatedSourceRows?: number; minimumIndustrySample?: number } = {}
): StoreAreaSourceProfile {
  const classified = rows.map((row) => ({ ...row, parsed: parseRawStoreArea(row.areaRaw) }));
  const positives = classified.flatMap((row) => row.parsed.kind === "positive" ? [row.parsed.value!] : []);
  const counts = {
    blank: classified.filter((row) => row.parsed.kind === "blank").length,
    invalid: classified.filter((row) => row.parsed.kind === "invalid").length,
    positive: positives.length,
    zero: classified.filter((row) => row.parsed.kind === "zero").length
  };
  const ratio = (count: number) => rows.length ? round((count / rows.length) * 100, 1) : 0;
  const industries = new Map<string, { positives: number[]; rows: number }>();
  for (const row of classified) {
    const industry = row.industry?.trim() || "미분류";
    const current = industries.get(industry) || { positives: [], rows: 0 };
    current.rows += 1;
    if (row.parsed.kind === "positive") current.positives.push(row.parsed.value!);
    industries.set(industry, current);
  }
  const minimumIndustrySample = Math.max(1, options.minimumIndustrySample || 10);
  const byIndustry = Array.from(industries.entries())
    .filter(([, value]) => value.positives.length >= minimumIndustrySample)
    .map(([industry, value]) => ({
      industry,
      medianSqm: round(median(value.positives)!),
      positiveRows: value.positives.length,
      sampledRows: value.rows
    }))
    .sort((a, b) => b.positiveRows - a.positiveRows || a.industry.localeCompare(b.industry, "ko"));
  const estimatedSourceRows = options.estimatedSourceRows;
  const estimated = estimatedSourceRows === undefined ? undefined : {
    blank: Math.round((counts.blank / Math.max(1, rows.length)) * estimatedSourceRows),
    invalid: Math.round((counts.invalid / Math.max(1, rows.length)) * estimatedSourceRows),
    positive: Math.round((counts.positive / Math.max(1, rows.length)) * estimatedSourceRows),
    sourceRows: estimatedSourceRows,
    zero: Math.round((counts.zero / Math.max(1, rows.length)) * estimatedSourceRows)
  };
  const highTailStart = percentile(positives, 0.99);

  return {
    actual: {
      ...counts,
      blankRate: ratio(counts.blank),
      invalidRate: ratio(counts.invalid),
      maximumSqm: positives.length ? Math.max(...positives) : undefined,
      medianSqm: positives.length ? round(median(positives)!) : undefined,
      minimumSqm: positives.length ? Math.min(...positives) : undefined,
      outlierExamples: highTailStart === undefined ? [] : positives.filter((value) => value >= highTailStart).sort((a, b) => b - a).slice(0, 10),
      p95Sqm: positives.length ? round(percentile(positives, 0.95)!) : undefined,
      positiveRate: ratio(counts.positive),
      rows: rows.length,
      zeroRate: ratio(counts.zero)
    },
    byIndustry,
    estimated
  };
}
