"use client";
import { useState } from "react";
import { documentRequest } from "@/lib/pricing/document-client";
import { type CatalogChoice, type ProductSet } from "@/domains/pricing/document";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
const box = "rounded border border-slate-300 px-3 py-2";
const action = "min-h-[44px] px-2 text-sm font-bold text-teal-800 underline";
type Props = {
  companyId: string;
  manager: boolean;
  busy: boolean;
  sets: ProductSet[];
  selectedProductIds: string[];
  catalog: CatalogChoice[];
  profile: { companyName: string; contact: string; footer: string };
  run: (action: () => Promise<void>) => Promise<void>;
  reload: () => Promise<void>;
  loadSet: (set: ProductSet) => Promise<void>;
};

// CC-20: 묶음·템플릿은 공용 표(열 편집·CSV) + 오른쪽 서랍. 품목과 순서만 저장하고 가격은 불러올 때 다시 계산하는 규칙은 그대로.
export function PricingDocumentLibrary(p: Props) {
  const [editSet, setEditSet] = useState<ProductSet | null>(null),
    [ids, setIds] = useState<string[]>([]),
    [setName, setSetName] = useState(""),
    [setKind, setSetKind] = useState<"bundle" | "template">("bundle"),
    [shared, setShared] = useState(false),
    [drawer, setDrawer] = useState(false);
  const [importError, setImportError] = useState("");
  function selectSet(s: ProductSet | null, copy = false) {
    setEditSet(copy ? null : s);
    setIds(s?.productIds || []);
    setSetName(s ? `${s.name}${copy ? " 복사" : ""}` : "");
    setSetKind(s?.kind || "bundle");
    setShared(copy ? false : s?.shared || false);
    setImportError("");
    setDrawer(true);
  }
  function remove(s: ProductSet) {
    if (!window.confirm("묶음·템플릿을 삭제할까요? 기존 문서는 유지됩니다.")) return;
    void p.run(async () => {
      await documentRequest(p.companyId, "delete-set", { id: s.id, expected: s.revision }, true);
      await p.reload();
    });
  }
  function readCodes(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setImportError("엑셀 파일은 5MB 이하로 올려 주세요.");
      return;
    }
    setImportError("");
    void p.run(async () => {
      try {
        const { readSheet: readExcel } = await import("read-excel-file/browser");
        const rows = await readExcel(file);
        const codes = rows.map((row) => String(row[0] ?? "").trim()).filter(Boolean).filter((code) => code !== "상품코드");
        if (!codes.length || codes.length > 100) throw new Error("첫 열에 상품 코드를 1~100개 넣어 주세요.");
        const r = await documentRequest<{ items: CatalogChoice[] }>(p.companyId, "catalog", { productCodes: codes });
        const byCode = new Map(r.result.items.map((i) => [i.productCode, i.id]));
        if (codes.some((code) => !byCode.has(code))) throw new Error("찾을 수 없는 상품 코드가 있습니다. 회사 상품 원장을 확인해 주세요.");
        setIds(Array.from(new Set(codes.map((code) => byCode.get(code)!))));
      } catch (error) {
        setImportError(error instanceof Error ? error.message : "엑셀을 읽지 못했습니다.");
      }
    });
  }

  const columns: CommonTableColumn<ProductSet>[] = [
    { key: "name", label: "이름", value: (s) => s.name, sortable: true },
    { key: "kind", label: "종류", value: (s) => (s.kind === "bundle" ? "묶음" : "템플릿"), sortable: true },
    { key: "scope", label: "범위", value: (s) => (s.shared ? "우리 회사 공용" : "내 것"), sortable: true },
    { key: "count", label: "품목 수", value: (s) => s.productIds.length, align: "right", sortable: true, render: (s) => `${s.productIds.length}개` },
    {
      key: "actions", label: "관리", value: () => "",
      render: (s) => (
        <span className="flex flex-wrap">
          <button className={action} onClick={() => void p.run(() => p.loadSet(s))} type="button">현재 문서에 담기</button>
          <button className={action} onClick={() => selectSet(s, true)} type="button">복사</button>
          {s.editable ? <>
            <button className={action} onClick={() => selectSet(s)} type="button">수정</button>
            <button className={`${action} text-rose-700`} onClick={() => remove(s)} type="button">삭제</button>
          </> : null}
        </span>
      ),
    },
  ];

  return (
    <fieldset disabled={p.busy} className="pricing-no-print min-w-0 space-y-5">
      <section className="maju-section-card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">품목 묶음·템플릿</h2>
          <button className="maju-button-primary min-h-[44px] px-4" onClick={() => selectSet(null)} type="button">새 묶음·템플릿</button>
        </div>
        <p className="text-sm text-slate-600">
          품목과 순서만 저장합니다. 저장한 단가·마진율·문서 모양은 포함하지 않습니다. 불러올 때 현재 회사 가격 규칙으로 다시 계산합니다. 마진 그룹은 판매가 계산 규칙이며 이 품목 목록과 별개입니다.
        </p>
        <CommonDataTable columns={columns} emptyMessage="저장한 묶음·템플릿이 없습니다." filename="묶음-템플릿.csv" phoneCards rowKey={(s) => s.id} rows={p.sets} settingsKey={`product-sets:${p.companyId}`} />
      </section>
      {drawer ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setDrawer(false)}>
          <form
            aria-label={editSet ? "묶음·템플릿 수정" : "묶음·템플릿 만들기"}
            aria-modal="true"
            className="h-full w-full max-w-md space-y-3 overflow-y-auto bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void p.run(async () => {
                await documentRequest(
                  p.companyId,
                  "save-set",
                  { id: editSet?.id || crypto.randomUUID(), expected: editSet?.revision || 0, content: { name: setName, kind: setKind, shared, productIds: ids } },
                  true,
                );
                await p.reload();
                setDrawer(false);
                setEditSet(null);
              });
            }}
            role="dialog"
          >
            <h2 className="text-lg font-black">{editSet ? "묶음·템플릿 수정" : "새 묶음·템플릿"}</h2>
            <label className="block text-sm font-bold">
              이름
              <input value={setName} onChange={(e) => setSetName(e.target.value)} required maxLength={100} className={`${box} mt-1 block w-full`} />
            </label>
            <label className="block text-sm font-bold">
              종류
              <select value={setKind} onChange={(e) => setSetKind(e.target.value as "bundle" | "template")} className={`${box} mt-1 block w-full`}>
                <option value="bundle">묶음</option>
                <option value="template">품목 템플릿</option>
              </select>
            </label>
            <label className="flex min-h-[44px] items-center gap-2 text-sm font-bold">
              <input type="checkbox" disabled={!p.manager} checked={shared} onChange={(e) => setShared(e.target.checked)} />
              우리 회사 공용
            </label>
            <p className="text-sm font-bold">{ids.length}개 품목</p>
            <div className="flex flex-wrap gap-2">
              <button className={`${box} min-h-[44px]`} onClick={() => setIds(Array.from(new Set(p.selectedProductIds)))} type="button">현재 문서의 품목 담기</button>
              <label className={`${box} min-h-[44px] cursor-pointer text-sm`}>
                엑셀에서 상품 코드 읽기
                <input
                  className="block"
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (file) readCodes(file);
                  }}
                />
              </label>
            </div>
            {importError && <p role="alert" className="text-red-700">{importError}</p>}
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <button className="maju-button-primary min-h-[44px] px-4" type="submit">{editSet ? "수정 저장" : "새로 저장"}</button>
              <button className="min-h-[44px] rounded-lg border px-4" onClick={() => setDrawer(false)} type="button">닫기</button>
            </div>
          </form>
        </div>
      ) : null}
    </fieldset>
  );
}
