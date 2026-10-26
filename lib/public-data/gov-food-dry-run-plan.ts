import { GOV_OPEN_AUTHORITY_CODES } from "../gov-area-codes";
import { GOV_DATASETS, GOV_PAGE_SIZE } from "../gov-restaurant";
import type { GovDataset } from "../gov-area-scan";

export const A2_GANGNAM_AREA = "서울특별시 강남구";
export const A2_GANGNAM_AREA_CODE = GOV_OPEN_AUTHORITY_CODES[A2_GANGNAM_AREA];
export const A2_ACTIVE_STATUS_CODE = "01";

// 일반음식점은 기존 기준선이 있으므로 A2 드라이런은 아직 미측정인 추가 4종을 대상으로 한다.
export const A2_GANGNAM_DRY_RUN_DATASETS = GOV_DATASETS.filter(
  (dataset): dataset is Exclude<GovDataset, "general_restaurants"> => dataset !== "general_restaurants"
);

export type GovFoodDryRunCursor = { dataset: GovDataset; page: number };

export type GovFoodDryRunMeasurement = {
  dataset: GovDataset;
  activeTotalCount: number;
};

export function buildGangnamDryRunRequest(dataset: GovDataset, page = 1) {
  if (!A2_GANGNAM_AREA_CODE) throw new Error(`${A2_GANGNAM_AREA} 개방자치단체코드가 없습니다.`);
  return {
    dataset,
    area: A2_GANGNAM_AREA,
    areaCode: A2_GANGNAM_AREA_CODE,
    statusCode: A2_ACTIVE_STATUS_CODE,
    page: Math.max(1, Math.trunc(page)),
    pageSize: GOV_PAGE_SIZE,
    activeOnly: true,
    writeEnabled: false
  } as const;
}

export function estimateGovFoodDryRun(measurements: readonly GovFoodDryRunMeasurement[], rowBytes = 870) {
  const datasets = measurements.map(({ dataset, activeTotalCount }) => {
    const rows = Math.max(0, Math.trunc(activeTotalCount));
    return {
      dataset,
      rows,
      pages: Math.max(1, Math.ceil(rows / GOV_PAGE_SIZE)),
      estimatedBytes: rows * rowBytes
    };
  });
  return {
    datasets,
    rows: datasets.reduce((sum, item) => sum + item.rows, 0),
    calls: datasets.reduce((sum, item) => sum + item.pages, 0),
    estimatedBytes: datasets.reduce((sum, item) => sum + item.estimatedBytes, 0)
  };
}

export function nextGovFoodDryRunCursor(
  current: GovFoodDryRunCursor,
  totalPages: Readonly<Partial<Record<GovDataset, number>>>,
  datasets: readonly GovDataset[] = A2_GANGNAM_DRY_RUN_DATASETS
): GovFoodDryRunCursor | null {
  const datasetIndex = datasets.indexOf(current.dataset);
  if (datasetIndex < 0) throw new Error(`드라이런 대상이 아닌 데이터셋입니다: ${current.dataset}`);
  const pages = Math.max(1, Math.trunc(totalPages[current.dataset] || 1));
  if (current.page < pages) return { dataset: current.dataset, page: current.page + 1 };
  const nextDataset = datasets[datasetIndex + 1];
  return nextDataset ? { dataset: nextDataset, page: 1 } : null;
}

export function getSafeRowBudget(options: {
  currentDatabaseMb: number;
  stopAtMb: number;
  estimatedRowBytes?: number;
}) {
  const estimatedRowBytes = options.estimatedRowBytes || 870;
  const availableBytes = Math.max(0, options.stopAtMb - options.currentDatabaseMb) * 1_000_000;
  return Math.floor(availableBytes / estimatedRowBytes);
}
