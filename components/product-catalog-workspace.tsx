"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  History,
  Loader2,
  PackagePlus,
  X,
} from "lucide-react";
import {
  CommonDataTable,
  type CommonTableColumn,
} from "@/components/common-data-table";
import {
  buildCatalogPreview,
  catalogFields,
  suggestCatalogMapping,
  type CatalogField,
  type CatalogMapping,
  type RawCatalogRow,
} from "@/domains/product/catalog-import";
import { ProductCatalogAdmin } from "@/components/product-catalog-admin";
import { ImportRowEditor } from "@/components/import-row-editor";
import { CustomerItemsImportDrawer } from "./customer-items-import-drawer";
import type { ImportPreviewField, ImportPreviewRow } from "@/domains/product/import-row-editor";
import type {
  ProductImportAuditItem,
  SupplierProductAdminItem,
} from "@/lib/product-catalog-import";
import { defaultConversionReviewRatio } from "@/lib/product-conversion-review";
import { runLimited } from "@/lib/run-limited";

type Workspace = {
  catalogCount: number;
  imports: ProductImportAuditItem[];
  items: SupplierProductAdminItem[];
  suppliers: Array<{ id: string; name: string }>;
};
type Tab = "catalog" | "supplier" | "mapping" | "imports";
const labels: Record<CatalogField, string> = {
  productName: "상품명",
  spec: "규격",
  unit: "단위",
  cost: "원가(직접 확인)",
  salesPrice: "판매가 참고",
  productCode: "상품코드",
  barcode: "바코드",
  buyerName: "구매처명",
  buyerCode: "구매처코드",
  date: "일자",
  quantity: "수량",
  supplyAmount: "공급가액",
  vat: "부가세",
};
const money = (value?: number) =>
  value == null ? "-" : `${value.toLocaleString("ko-KR")}원`;
const canConfirmConversion = (item: SupplierProductAdminItem) =>
  !!item.matchedCatalogId && !item.conversionConfirmed &&
  (item.matchStatus === "auto" || item.matchStatus === "confirmed");
const importPreviewFields: ImportPreviewField[] = [
  { key: "rawName", label: "상품명" },
  { key: "rawSpec", label: "규격" },
  { key: "unit", label: "단위" },
  { key: "cost", label: "확정 원가" },
  { key: "salesMedian", label: "판매가" },
];
const importTargets = [
  ["상품 마스터", "매입처 단가표를 적재한 뒤 확인 품목을 상품 마스터로 전환합니다.", true],
  ["매출처 · 매입처", "거래처 기본정보 가져오기 · SQL 승인 대기", false],
  ["거래처 원장", "거래처별 품목 · 단가 가져오기 · SQL 승인 대기", false],
  ["재고", "기준일 재고와 위치 가져오기 · 재고 원장 승인 대기", false],
] as const;

export function ProductCatalogWorkspace({
  categoriesEnabled = false,
  canManageCategories = false,
  companyId = "",
  importAuditV2Enabled = false,
  importTargetsEnabled = false,
  customerItemsEnabled = false,
  rowEditorEnabled = false,
  initialTab = "catalog",
  tableSettingsKey = "products:current",
}: {
  categoriesEnabled?: boolean;
  canManageCategories?: boolean;
  companyId?: string;
  importAuditV2Enabled?: boolean;
  importTargetsEnabled?: boolean;
  customerItemsEnabled?: boolean;
  rowEditorEnabled?: boolean;
  initialTab?: Tab;
  tableSettingsKey?: string;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [conversionSelected, setConversionSelected] = useState<string[]>([]);
  const [conversionRatios, setConversionRatios] = useState<Record<string, string>>({});
  const [conversionErrors, setConversionErrors] = useState<Record<string, string>>({});
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showAllSupplierItems, setShowAllSupplierItems] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setTab(initialTab), [initialTab]);
  async function load() {
    setLoading(true);
    try {
      const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const r = await fetch(`/api/product-catalog/imports${q}`, {
        cache: "no-store",
      });
      const p = (await r.json()) as Workspace & { message?: string };
      if (!r.ok) throw new Error(p.message || "불러오기 실패");
      setWorkspace(p);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "유통사 상품을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (tab !== "catalog") void load();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  async function createStandards() {
    if (!selected.length) return;
    if (
      !window.confirm(
        `선택한 ${selected.length}개를 표준 품목으로 생성하고 연결할까요?`,
      )
    ) return;
    setLoading(true);
    setMessage("");
    let processed = 0;
    let created = 0;
    try {
      for (let index = 0; index < selected.length; index += 25) {
        const r = await fetch("/api/product-catalog/imports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create-standards",
            companyId,
            supplierProductIds: selected.slice(index, index + 25),
          }),
        });
        const p = (await r.json()) as {
          createdCount?: number;
          message?: string;
        };
        if (!r.ok) throw new Error(p.message || "표준 품목 생성 실패");
        processed += Math.min(25, selected.length - index);
        created += p.createdCount || 0;
        setMessage(`${processed}/${selected.length}개 처리 중`);
      }
      setMessage(`${created}개를 표준 품목으로 생성하고 연결했습니다.`);
      setSelected([]);
      await load();
    } catch (e) {
      setSelected(selected.slice(processed));
      setMessage(
        `앞 ${processed}개 완료. 남은 품목을 다시 저장해 주세요. ${e instanceof Error ? e.message : "표준 품목을 만들지 못했습니다."}`,
      );
    } finally {
      setLoading(false);
    }
  }
  function reviewRatio(item: SupplierProductAdminItem) {
    return conversionRatios[item.id] ?? defaultConversionReviewRatio(item);
  }
  async function saveConversion(item: SupplierProductAdminItem) {
    const ratio = Number(reviewRatio(item));
    if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("매입 1단위에 해당하는 기본 단위 수를 입력해 주세요.");
    const response = await fetch("/api/product-catalog/imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "confirm-conversion",
        companyId,
        supplierProductId: item.id,
        ratio,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "환산 비율을 저장하지 못했습니다.");
  }
  async function confirmConversion(item: SupplierProductAdminItem) {
    setLoading(true);
    try {
      await saveConversion(item);
      setMessage(`${item.rawName}의 환산 비율을 확정했습니다.`);
      setConversionErrors((current) => ({ ...current, [item.id]: "" }));
      setConversionSelected((current) => current.filter((id) => id !== item.id));
      await load();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "환산 비율을 저장하지 못했습니다.";
      setConversionErrors((current) => ({ ...current, [item.id]: detail }));
      setMessage(detail);
    } finally {
      setLoading(false);
    }
  }
  async function confirmSelectedConversions() {
    const pending = items.filter((item) => conversionSelected.includes(item.id) && canConfirmConversion(item));
    if (!pending.length) return;
    setLoading(true);
    try {
      const results = await runLimited(pending, 5, async (item) => {
        try {
          await saveConversion(item);
          return { id: item.id, error: "" };
        } catch (error) {
          return { id: item.id, error: error instanceof Error ? error.message : "환산 비율을 저장하지 못했습니다." };
        }
      });
      const failures = Object.fromEntries(results.filter((result) => result.error).map((result) => [result.id, result.error]));
      setConversionErrors(failures);
      setConversionSelected(Object.keys(failures));
      setMessage(`${results.length - Object.keys(failures).length}개 확정${Object.keys(failures).length ? ` · ${Object.keys(failures).length}개 실패 (항목별 오류 확인 후 재시도)` : ""}`);
      await load();
    } finally {
      setLoading(false);
    }
  }
  const items = workspace?.items || [];
  const unconfirmed = items.filter(canConfirmConversion);
  const visibleItems = (tab === "supplier" && !showAllSupplierItems ? unconfirmed : items).filter((item) => {
    if (tab !== "supplier") return true;
    const query = supplierSearch.trim().toLowerCase();
    return !query || [item.rawName, item.supplierName, item.matchedCatalogName, item.productCode]
      .some((value) => value?.toLowerCase().includes(query));
  });
  const oneToOneVisible = visibleItems.filter((item) =>
    canConfirmConversion(item) && defaultConversionReviewRatio(item) === "1" && reviewRatio(item) === "1",
  );
  const readyToCreate = items
    .filter((item) => !item.matchedCatalogId && item.costConfirmed)
    .map((item) => item.id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex max-w-full gap-1 overflow-x-auto">
          {(
            // 2149 지시서: 탭은 전체 상품 · 전체 상품 업로드 · 업로드 이력 3개만. 매입처 상품·표준 품목 연결 탭은 두지 않는다
            // (매입처 가격 파일은 매입가 반영, 품목 맞추기는 업로드 미리보기에서).
            [
              ["catalog", "전체 상품"],
              ["upload", "전체 상품 업로드"],
              ["imports", "업로드 이력"],
            ] as const
          ).map(([id, label]) => (
            <button
              className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${tab === id ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              key={id}
              onClick={() => (id === "upload" ? setDrawer(true) : setTab(id))}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="maju-button-secondary min-h-11"
          onClick={() => setTab("supplier")}
          type="button"
        >
          매입처 환산 확인{workspace ? ` · 미확정 ${unconfirmed.length}개` : ""}
        </button>
      </div>
      {message ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900">
          {message}
        </div>
      ) : null}
      {tab === "catalog" ? (
        <ProductCatalogAdmin
          categoriesEnabled={categoriesEnabled}
          canManageCategories={canManageCategories}
          companyId={companyId}
          settingsKey={tableSettingsKey}
        />
      ) : tab === "imports" ? (
        <ImportAuditPanel
          auditV2Enabled={importAuditV2Enabled}
          imports={workspace?.imports || []}
          loading={loading && !workspace}
        />
      ) : (
        <section className="maju-section-card">
          <div className="maju-card-header flex items-center justify-between">
            <div>
              <h2 className="maju-section-title">
                {tab === "supplier"
                  ? "매입처 원본 상품"
                  : "회사 상품 연결 상태"}
              </h2>
              <p className="mt-1 maju-muted-label">
                {items.length.toLocaleString()}개 · 표준 품목{" "}
                {workspace?.catalogCount || 0}개
              </p>
            </div>
            {tab === "supplier" && showAllSupplierItems ? (
              <div className="flex flex-wrap gap-2">
                <button
                  className="maju-button-secondary"
                  disabled={loading || !readyToCreate.length}
                  onClick={() => setSelected(readyToCreate)}
                  type="button"
                >
                  원가 확정·미연결 {readyToCreate.length}개 전체 선택
                </button>
                {selected.length ? (
                  <button
                    className="maju-button-primary inline-flex items-center gap-2"
                    disabled={loading}
                    onClick={createStandards}
                    type="button"
                  >
                    <PackagePlus className="h-4 w-4" />
                    선택 {selected.length}개 표준 품목 생성
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {tab === "supplier" ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
              <label className="text-sm font-semibold" htmlFor="supplier-conversion-search">매입처 상품 검색</label>
              <input
                className="maju-input min-h-11 min-w-0 flex-1 sm:max-w-xs"
                id="supplier-conversion-search"
                onChange={(event) => setSupplierSearch(event.target.value)}
                placeholder="상품명·매입처·코드"
                value={supplierSearch}
              />
              <button
                aria-pressed={!showAllSupplierItems}
                className="maju-button-secondary min-h-11"
                onClick={() => setShowAllSupplierItems((value) => !value)}
                type="button"
              >
                {showAllSupplierItems ? `미확정 ${unconfirmed.length}개만 보기` : "전체 매입처 상품 보기"}
              </button>
              <button
                className="maju-button-secondary min-h-11"
                disabled={loading || !oneToOneVisible.length}
                onClick={() => {
                  setConversionSelected((current) => Array.from(new Set([...current, ...oneToOneVisible.map((item) => item.id)])));
                  setMessage("단위가 같은 1:1 항목을 선택했습니다. 매입·기본 단위를 확인한 뒤 환산 확정을 눌러 주세요.");
                }}
                type="button"
              >
                검색 결과의 1:1 항목 선택 ({oneToOneVisible.length})
              </button>
              <button
                className="maju-button-primary min-h-11"
                disabled={loading || !conversionSelected.length}
                onClick={() => void confirmSelectedConversions()}
                type="button"
              >
                선택 {conversionSelected.length}개 환산 확정
              </button>
            </div>
          ) : null}
          {loading && !workspace ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    {tab === "supplier" ? (
                      <th className="px-4 py-3">선택</th>
                    ) : null}
                    <th className="px-4 py-3">유통사</th>
                    <th className="px-4 py-3">원본 상품</th>
                    <th className="px-4 py-3">코드 / 바코드</th>
                    <th className="px-4 py-3 text-right">확정 원가</th>
                    <th className="px-4 py-3">매핑</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleItems.map((item) => (
                    <tr key={item.id}>
                      {tab === "supplier" ? (
                        <td className="px-4 py-3">
                          <input
                            aria-label={`${item.rawName} ${canConfirmConversion(item) ? "환산 확인 선택" : "표준 품목 생성 선택"}`}
                            checked={canConfirmConversion(item) ? conversionSelected.includes(item.id) : selected.includes(item.id)}
                            disabled={loading || (!!item.matchedCatalogId && (!canConfirmConversion(item) || !(Number(reviewRatio(item)) > 0)))}
                            onChange={(e) =>
                              canConfirmConversion(item)
                                ? setConversionSelected((v) => e.target.checked ? [...v, item.id] : v.filter((id) => id !== item.id))
                                : setSelected((v) => e.target.checked ? [...v, item.id] : v.filter((id) => id !== item.id))
                            }
                            type="checkbox"
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-3 font-semibold">
                        {item.supplierName}
                      </td>
                      <td className="px-4 py-3">
                        <b>{item.rawName}</b>
                        <div className="text-xs text-slate-500">
                          {item.rawSpec || "-"} · {item.rawUnit || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {item.productCode || "-"} / {item.barcode || "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        {item.costConfirmed ? (
                          money(item.latestCost)
                        ) : (
                          <span className="text-amber-700">원가 미확정</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {item.matchedCatalogName ? (
                          <div>
                            <span className="font-semibold text-emerald-700">
                              {item.matchedCatalogName}
                            </span>
                            <div className="mt-1 text-xs">
                              {item.conversionConfirmed ? (
                                `환산 ${item.suggestedRatio || 1}:1 확정`
                              ) : canConfirmConversion(item) ? (
                                <div className="flex min-w-52 flex-wrap items-center gap-2">
                                  <label className="sr-only" htmlFor={`conversion-${item.id}`}>매입 1{item.rawUnit || "단위"}당 기본 단위 수</label>
                                  <input
                                    className="maju-input min-h-11 w-24"
                                    id={`conversion-${item.id}`}
                                    min="0.001"
                                    onChange={(event) => setConversionRatios((current) => ({ ...current, [item.id]: event.target.value }))}
                                    placeholder={item.suggestedRatio ? `추천 ${item.suggestedRatio}` : "비율 입력"}
                                    step="any"
                                    type="number"
                                    value={reviewRatio(item)}
                                  />
                                  <span className="text-slate-500">{item.rawUnit || "매입 단위"} → {item.matchedCatalogUnit || "기본 단위"}</span>
                                  <button className="maju-button-secondary min-h-11" disabled={loading || !(Number(reviewRatio(item)) > 0)} onClick={() => void confirmConversion(item)} type="button">확정</button>
                                  {conversionErrors[item.id] ? <span className="w-full text-red-700" role="alert">{conversionErrors[item.id]}</span> : null}
                                </div>
                              ) : <span className="text-amber-700">매핑 확인 필요</span>}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">후보 확인 필요</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleItems.length ? (
                <div className="p-12 text-center text-sm font-semibold text-slate-500">
                  {tab === "supplier" ? "조건에 맞는 환산 미확정 상품이 없습니다. 검색어를 지우거나 전체 보기를 선택해 주세요." : "먼저 매입 단가표를 업로드해 주세요."}
                </div>
              ) : null}
            </div>
          )}
        </section>
      )}
      {drawer ? (
        <ImportDrawer
          auditV2Enabled={importAuditV2Enabled}
          companyId={companyId}
          importTargetsEnabled={importTargetsEnabled}
          customerItemsEnabled={customerItemsEnabled}
          rowEditorEnabled={rowEditorEnabled}
          onClose={() => setDrawer(false)}
          onSaved={async (m, target) => {
            setMessage(m);
            setDrawer(false);
            if (target !== "customer_items") setTab("supplier");
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

const importStatus: Record<string, string> = {
  processing: "처리 중",
  completed: "완료",
  failed: "실패",
};

function ImportAuditPanel({
  auditV2Enabled,
  imports,
  loading,
}: {
  auditV2Enabled: boolean;
  imports: ProductImportAuditItem[];
  loading: boolean;
}) {
  const columns = useMemo<CommonTableColumn<ProductImportAuditItem>[]>(
    () => [
      {
        key: "createdAt",
        label: "실행 시각",
        width: 150,
        value: (item) => item.createdAt,
        render: (item) =>
          new Date(item.createdAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          }),
      },
      {
        key: "supplier",
        label: "매입처",
        width: 130,
        value: (item) => item.supplierName,
      },
      {
        key: "file",
        label: "파일",
        width: 220,
        value: (item) => item.fileName,
      },
      {
        key: "status",
        label: "상태",
        width: 90,
        value: (item) => importStatus[item.status] || item.status,
        render: (item) => (
          <span
            className={
              item.status === "completed"
                ? "font-bold text-emerald-700"
                : item.status === "failed"
                  ? "font-bold text-rose-700"
                  : "font-bold text-amber-700"
            }
          >
            {importStatus[item.status] || item.status}
          </span>
        ),
      },
      {
        key: "total",
        label: "전체",
        align: "right",
        total: true,
        width: 70,
        value: (item) => item.totalRows,
      },
      {
        key: "created",
        label: "신규",
        align: "right",
        total: true,
        width: 70,
        value: (item) => item.createdCount,
      },
      {
        key: "updated",
        label: "갱신",
        align: "right",
        total: true,
        width: 70,
        value: (item) => item.updatedCount,
      },
      {
        key: "excluded",
        label: "제외",
        align: "right",
        total: true,
        width: 70,
        value: (item) => item.excludedCount,
      },
      {
        key: "warnings",
        label: "경고",
        align: "right",
        total: true,
        width: 70,
        value: (item) => item.warningCount,
      },
      {
        key: "actor",
        label: "실행자",
        width: 110,
        value: (item) => item.createdByName || "-",
      },
      {
        key: "error",
        label: "오류",
        defaultHidden: true,
        width: 260,
        value: (item) => item.errorMessage || "-",
      },
    ],
    [],
  );

  return (
    <section className="maju-section-card">
      <div className="maju-card-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-teal-700" />
            <h2 className="maju-section-title">가져오기 감사</h2>
          </div>
          <p className="mt-1 maju-muted-label">
            파일별 처리 결과와 실행자를 기존 승인 이력에서 확인합니다.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
          <Clock3 className="h-3.5 w-3.5" /> 최근 {imports.length.toLocaleString()}건
        </span>
      </div>
      {!auditV2Enabled ? (
        <p className="border-y border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          행별 이전값·오류 상세 감사 OFF · WO-25 SQL 승인 대기
        </p>
      ) : null}
      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <CommonDataTable
          columns={columns}
          emptyMessage="가져오기 이력이 없습니다."
          filename="상품_가져오기_감사.csv"
          rowKey={(item) => item.id}
          rows={imports}
          settingsKey="product-import-audit"
        />
      )}
    </section>
  );
}

function ImportDrawer({
  auditV2Enabled,
  companyId,
  importTargetsEnabled,
  customerItemsEnabled,
  rowEditorEnabled,
  onClose,
  onSaved,
}: {
  auditV2Enabled: boolean;
  companyId: string;
  importTargetsEnabled: boolean;
  customerItemsEnabled: boolean;
  rowEditorEnabled: boolean;
  onClose: () => void;
  onSaved: (message: string, target?: "customer_items") => void;
}) {
  const [target, setTarget] = useState("product");
  const [file, setFile] = useState<File | null>(null),
    [supplier, setSupplier] = useState(""),
    [rows, setRows] = useState<RawCatalogRow[]>([]),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<CatalogMapping>({}),
    [editedRows, setEditedRows] = useState<ImportPreviewRow[]>([]),
    [step, setStep] = useState(1),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const preview = useMemo(() => {
    if (step < 3) return null;
    try {
      return buildCatalogPreview(rows, mapping, supplier);
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "미리보기를 만들지 못했습니다.",
      };
    }
  }, [mapping, rows, step, supplier]);
  const previewRows = useMemo<ImportPreviewRow[]>(() => {
    if (!preview || "error" in preview) return [];
    return preview.products.map((product, index) => {
      const values = {
        rawName: product.rawName,
        rawSpec: product.rawSpec || "",
        unit: product.unit,
        cost: String(product.cost),
        salesMedian: product.salesMedian == null ? "" : String(product.salesMedian),
      };
      return { id: product.sourceFingerprint, sourceRowNumber: index + 2, originalValues: values, values };
    });
  }, [preview]);
  async function read(next: File) {
    setError("");
    try {
      const XLSX = await import("xlsx");
      const data = await next.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<RawCatalogRow>(sheet, {
        defval: "",
        raw: false,
        dateNF: "yyyy-mm-dd",
      });
      const names = parsed[0] ? Object.keys(parsed[0]) : [];
      setFile(next);
      setRows(parsed);
      setHeaders(names);
      setMapping(suggestCatalogMapping(names));
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
    }
  }
  async function save() {
    if (!file || !preview || "error" in preview) return;
    const activeRows = rowEditorEnabled && auditV2Enabled ? (editedRows.length ? editedRows : previewRows) : [];
    const editedById = new Map(activeRows.map((row) => [row.id, row.values]));
    const products = preview.products.map((product) => {
      const values = editedById.get(product.sourceFingerprint);
      if (!values) return product;
      return {
        ...product,
        rawName: values.rawName.trim(),
        name: values.rawName.trim(),
        rawSpec: values.rawSpec.trim() || undefined,
        unit: values.unit.trim() || "미정",
        cost: Number(values.cost.replaceAll(",", "")),
        salesMedian: values.salesMedian ? Number(values.salesMedian.replaceAll(",", "")) : undefined,
      };
    });
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/product-catalog/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-import",
          companyId,
          fileName: file.name,
          supplierName: supplier,
          mapping,
          products,
          editedRows: activeRows,
          excludedCount: preview.excludedCount,
          warnings: preview.warnings,
        }),
      });
      const p = (await r.json()) as {
        createdCount?: number;
        updatedCount?: number;
        excludedCount?: number;
        warningCount?: number;
        message?: string;
      };
      if (!r.ok) throw new Error(p.message || "저장 실패");
      onSaved(
        `신규 ${p.createdCount || 0} · 갱신 ${p.updatedCount || 0} · 제외 ${p.excludedCount || 0} · 경고 ${p.warningCount || 0}`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "업로드를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (target === "customer_items" && customerItemsEnabled && importTargetsEnabled) {
    return <CustomerItemsImportDrawer companyId={companyId} onClose={onClose} onSaved={message => onSaved(message, "customer_items")} onBack={() => setTarget("product")} />;
  }
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/45">
      <section
        aria-label="전체 상품 업로드"
        className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b p-5">
          <div>
            <p className="text-xs font-black text-teal-700">STEP {step} / 4</p>
            <h2 className="text-xl font-black">전체 상품 업로드</h2>
          </div>
          <button
            aria-label="닫기"
            className="rounded-lg p-2 hover:bg-slate-100"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {step === 1 ? (
            <>
              {importTargetsEnabled ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-bold">가져올 대상</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {importTargets.map(([label, description, ready]) => {
                      const isCustomerItems = label === "거래처 원장";
                      const enabled = ready || (isCustomerItems && customerItemsEnabled);
                      return (
                      <label
                        className={`rounded-xl border p-3 text-left ${enabled ? "border-teal-600 bg-teal-50" : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500"}`}
                        key={label}
                      >
                        <span className="flex items-center gap-2 text-sm font-black">
                          <input checked={isCustomerItems ? target === "customer_items" : ready} disabled={!enabled} name="import-target" onChange={() => setTarget(isCustomerItems ? "customer_items" : "product")} type="radio" />
                          {label}
                        </span>
                        <span className="mt-1 block text-xs leading-5">{isCustomerItems && customerItemsEnabled ? "거래처별 품목과 최근 실제 단가를 확인하고 가져옵니다." : description}</span>
                      </label>
                    ); })}
                  </div>
                </fieldset>
              ) : null}
              <label className="space-y-2">
                <span className="text-sm font-bold">유통사명</span>
                <input
                  className="maju-input w-full"
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="예: 배동바지"
                  value={supplier}
                />
              </label>
              <label className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center">
                <FileSpreadsheet className="mb-3 h-10 w-10 text-teal-700" />
                <b>.xls · .xlsx · .csv 파일 선택</b>
                <span className="mt-1 text-sm text-slate-500">
                  원가 열은 다음 단계에서 직접 확인합니다.
                </span>
                <input
                  accept=".xls,.xlsx,.csv"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && supplier.trim()) void read(f);
                    else if (f) setError("유통사명을 먼저 입력해 주세요.");
                  }}
                  type="file"
                />
              </label>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                <b>원가 열은 자동 확정하지 않습니다.</b> 실제 매입 원가가 든
                열인지 확인해야 자동 견적에 사용됩니다.
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {catalogFields.map((field) => (
                  <label className="space-y-1" key={field}>
                    <span className="text-xs font-bold text-slate-600">
                      {labels[field]}
                      {field === "productName" || field === "cost" ? " *" : ""}
                    </span>
                    <select
                      className="maju-input w-full"
                      onChange={(e) =>
                        setMapping((v) => ({
                          ...v,
                          [field]: e.target.value || undefined,
                        }))
                      }
                      value={mapping[field] || ""}
                    >
                      <option value="">선택 안 함</option>
                      {headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </>
          ) : null}
          {step === 3 && preview && !("error" in preview) ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Metric label="정상 품목" value={preview.products.length} />
                <Metric label="제외 행" value={preview.excludedCount} />
                <Metric label="경고" value={preview.warnings.length} />
              </div>
              {preview.warnings.map((w) => (
                <div
                  className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900"
                  key={w}
                >
                  {w}
                </div>
              ))}
              {rowEditorEnabled && auditV2Enabled ? (
                <ImportRowEditor fields={importPreviewFields} initialRows={previewRows} onRowsChange={setEditedRows} />
              ) : <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs">
                    <tr>
                      <th className="p-3">상품</th>
                      <th className="p-3">규격</th>
                      <th className="p-3 text-right">확정 원가</th>
                      <th className="p-3 text-right">판매가 중앙값</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.products.slice(0, 100).map((p) => (
                      <tr key={p.sourceFingerprint}>
                        <td className="p-3 font-semibold">{p.rawName}</td>
                        <td className="p-3">
                          {p.rawSpec || "-"} / {p.unit}
                        </td>
                        <td className="p-3 text-right">{money(p.cost)}</td>
                        <td className="p-3 text-right">
                          {money(p.salesMedian)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
              <p className="text-xs text-slate-500">
                표준 품목이 없으면 저장 후 ‘유통사 상품’ 탭에서 확인한 품목을
                일괄 생성할 수 있습니다.
              </p>
            </>
          ) : null}
          {step === 4 && preview && !("error" in preview) ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
                <p className="text-xs font-black text-teal-700">최종 적용 확인</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">{file?.name}</h3>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Summary label="매입처" value={supplier} />
                  <Summary label="정상 품목" value={`${preview.products.length.toLocaleString()}건`} />
                  <Summary label="제외 행" value={`${preview.excludedCount.toLocaleString()}건`} />
                  <Summary label="경고" value={`${preview.warnings.length.toLocaleString()}건`} />
                </dl>
              </div>
              <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                적용하면 기존 상품은 갱신되고 새 상품은 추가됩니다. 파일명, 열 매핑,
                처리 건수와 실행자는 기존 업로드 이력에 기록됩니다.
              </p>
              {!auditV2Enabled ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                  행별 이전값·오류 상세 감사 OFF · WO-25 SQL 승인 대기
                </p>
              ) : null}
            </div>
          ) : null}
          {preview && "error" in preview ? (
            <p className="text-sm font-semibold text-rose-700">
              {preview.error}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm font-semibold text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex justify-between border-t p-5">
          <button
            className="maju-button-secondary"
            disabled={step === 1}
            onClick={() => setStep((v) => Math.max(1, v - 1))}
          >
            이전
          </button>
          {step === 2 ? (
            <button className="maju-button-primary" onClick={() => setStep(3)}>
              미리보기
            </button>
          ) : step === 3 ? (
            <button className="maju-button-primary" onClick={() => setStep(4)}>
              검토 완료
            </button>
          ) : step === 4 ? (
            <button
              className="maju-button-primary inline-flex items-center gap-2"
              disabled={saving || !preview || "error" in preview}
              onClick={save}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              확인 후 저장
            </button>
          ) : (
            <span />
          )}
        </footer>
      </section>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black">{value.toLocaleString()}건</div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 font-bold text-slate-950">{value}</dd>
    </div>
  );
}
