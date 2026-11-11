"use client";
import { useState } from "react";
import { documentRequest } from "@/lib/pricing/document-client";
import { type CatalogChoice, type ProductSet } from "@/domains/pricing/document";
const box = "rounded border border-slate-300 px-3 py-2";
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
export function PricingDocumentLibrary(p: Props) {
  const [editSet, setEditSet] = useState<ProductSet | null>(null),
    [ids, setIds] = useState<string[]>([]),
    [setName, setSetName] = useState(""),
    [setKind, setSetKind] = useState<"bundle" | "template">("bundle"),
    [shared, setShared] = useState(false);
  const [importError, setImportError] = useState("");
  function selectSet(s: ProductSet | null, copy = false) {
    setEditSet(copy ? null : s);
    setIds(s?.productIds || []);
    setSetName(s ? `${s.name}${copy ? " 복사" : ""}` : "");
    setSetKind(s?.kind || "bundle");
    setShared(copy ? false : s?.shared || false);
  }
  return (
    <fieldset disabled={p.busy} className="pricing-no-print min-w-0 space-y-5">
      <section className="maju-section-card space-y-3 p-4">
        <h2 className="text-lg font-bold">품목 묶음·템플릿</h2>
        <p className="text-sm text-slate-600">
          품목과 순서만 저장합니다. 저장한 단가·마진율·문서 모양은 포함하지 않습니다. 불러올 때 현재 회사 가격 규칙으로 다시 계산합니다. 마진 그룹은 판매가 계산 규칙이며 이 품목 목록과 별개입니다.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {p.sets.map((s) => (
            <article key={s.id} className="space-y-2 rounded border p-3">
              <h3 className="font-bold">{s.name}</h3>
              <p>
                {s.kind === "bundle" ? "묶음" : "템플릿"} ·{" "}
                {s.shared ? "우리 회사 공용" : "내 것"} · {s.productIds.length}
                개
              </p>
              <div className="flex flex-wrap gap-1">
                <button
                  className={box}
                  onClick={() => void p.run(() => p.loadSet(s))}
                >
                  현재 문서에 담기
                </button>
                <button className={box} onClick={() => selectSet(s, true)}>
                  복사해서 만들기
                </button>
                {s.editable && (
                  <>
                    <button className={box} onClick={() => selectSet(s)}>
                      수정
                    </button>
                    <button
                      className={box}
                      onClick={() => {
                        if (
                          window.confirm(
                            "묶음·템플릿을 삭제할까요? 기존 문서는 유지됩니다.",
                          )
                        )
                          void p.run(async () => {
                            await documentRequest(
                              p.companyId,
                              "delete-set",
                              { id: s.id, expected: s.revision },
                              true,
                            );
                            await p.reload();
                          });
                      }}
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
        <button className={box} onClick={() => selectSet(null)}>
          새 묶음·템플릿
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            className={box}
            onClick={() => setIds(Array.from(new Set(p.selectedProductIds)))}
          >
            현재 문서의 품목 담기
          </button>
          <label className={box}>
            엑셀에서 상품 코드 읽기
            <input
              className="block"
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  setImportError("엑셀 파일은 5MB 이하로 올려 주세요.");
                  return;
                }
                setImportError("");
                void p.run(async () => {
                  try {
                    const { readSheet: readExcel } = await import(
                      "read-excel-file/browser"
                    );
                    const rows = await readExcel(file);
                    const codes = rows
                      .map((row) => String(row[0] ?? "").trim())
                      .filter(Boolean)
                      .filter((code) => code !== "상품코드");
                    if (!codes.length || codes.length > 100)
                      throw new Error(
                        "첫 열에 상품 코드를 1~100개 넣어 주세요.",
                      );
                    const r = await documentRequest<{ items: CatalogChoice[] }>(
                      p.companyId,
                      "catalog",
                      { productCodes: codes },
                    );
                    const byCode = new Map(
                      r.result.items.map((i) => [i.productCode, i.id]),
                    );
                    if (codes.some((code) => !byCode.has(code)))
                      throw new Error(
                        "찾을 수 없는 상품 코드가 있습니다. 회사 상품 원장을 확인해 주세요.",
                      );
                    setIds(
                      Array.from(
                        new Set(codes.map((code) => byCode.get(code)!)),
                      ),
                    );
                  } catch (error) {
                    setImportError(
                      error instanceof Error
                        ? error.message
                        : "엑셀을 읽지 못했습니다.",
                    );
                  }
                });
              }}
            />
          </label>
        </div>
        {importError && (
          <p role="alert" className="text-red-700">
            {importError}
          </p>
        )}
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void p.run(async () => {
              await documentRequest(
                p.companyId,
                "save-set",
                {
                  id: editSet?.id || crypto.randomUUID(),
                  expected: editSet?.revision || 0,
                  content: {
                    name: setName,
                    kind: setKind,
                    shared,
                    productIds: ids,
                  },
                },
                true,
              );
              await p.reload();
              selectSet(null);
            });
          }}
        >
          <label>
            이름
            <input
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              required
              maxLength={100}
              className={`${box} block`}
            />
          </label>
          <label>
            종류
            <select
              value={setKind}
              onChange={(e) =>
                setSetKind(e.target.value as "bundle" | "template")
              }
              className={`${box} block`}
            >
              <option value="bundle">묶음</option>
              <option value="template">품목 템플릿</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              disabled={!p.manager}
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
            />{" "}
            우리 회사 공용
          </label>
          <span>{ids.length}개 품목</span>
          <button className={`${box} bg-slate-900 text-white`}>
            {editSet ? "수정 저장" : "새로 저장"}
          </button>
        </form>
      </section>
    </fieldset>
  );
}
