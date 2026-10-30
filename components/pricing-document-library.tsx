"use client";
import { useState } from "react";
import { documentRequest } from "@/lib/pricing/document-client";
import {
  koreaDay,
  lineFromCatalog,
  parseDocument,
  withLivePromotions,
  type CatalogChoice,
  type DocumentVersion,
  type ProductSet,
  type Promotion,
} from "@/domains/pricing/document";
const box = "rounded border border-slate-300 px-3 py-2";
type Props = {
  companyId: string;
  manager: boolean;
  busy: boolean;
  sets: ProductSet[];
  promotions: Promotion[];
  selectedProductIds: string[];
  catalog: CatalogChoice[];
  profile: { companyName: string; contact: string; footer: string };
  run: (action: () => Promise<void>) => Promise<void>;
  reload: () => Promise<void>;
  loadSet: (set: ProductSet) => Promise<void>;
  addPromotion: (promotion: Promotion) => Promise<void>;
  previewPromotion: (version: DocumentVersion) => void;
};
export function PricingDocumentLibrary(p: Props) {
  const [editSet, setEditSet] = useState<ProductSet | null>(null),
    [ids, setIds] = useState<string[]>([]),
    [setName, setSetName] = useState(""),
    [setKind, setSetKind] = useState<"bundle" | "template">("bundle"),
    [shared, setShared] = useState(false);
  const [editPromo, setEditPromo] = useState<Promotion | null>(null),
    [choices, setChoices] = useState<CatalogChoice[]>(p.catalog),
    [filter, setFilter] = useState("all"),
    [promoFormKey, setPromoFormKey] = useState(0),
    [importError, setImportError] = useState("");
  const today = koreaDay(),
    soon = koreaDay(new Date(Date.now() + 7 * 86400000));
  function active(x: Promotion) {
    return today >= x.startsOn && today <= x.endsOn && x.stock !== 0;
  }
  function selectSet(s: ProductSet | null, copy = false) {
    setEditSet(copy ? null : s);
    setIds(s?.productIds || []);
    setSetName(s ? `${s.name}${copy ? " 복사" : ""}` : "");
    setSetKind(s?.kind || "bundle");
    setShared(copy ? false : s?.shared || false);
  }
  async function preview(x: Promotion) {
    const latest = await documentRequest<Promotion[]>(
      p.companyId,
      "promotions",
    );
    const current = latest.result.find((promotion) => promotion.id === x.id);
    if (!current) throw new Error("행사 상품을 다시 불러와 주세요.");
    const r = await documentRequest<{ items: CatalogChoice[] }>(
      p.companyId,
      "catalog",
      { productIds: [current.productId] },
    );
    const item = r.result.items[0];
    if (!item) throw new Error("상품을 확인해 주세요.");
    const content = parseDocument({
      kind: "quote",
      title: `${current.badge} 상품`,
      companyName: p.profile.companyName || "행사 안내",
      contact: p.profile.contact,
      footer: p.profile.footer,
      recipient: "",
      validUntil: current.endsOn,
      theme: "blue",
      layout: "cards",
      showPrice: true,
      showBrand: true,
      showSpec: true,
      lines: [
        {
          ...lineFromCatalog(item),
          displayName: current.displayName,
          price: current.price,
          promotionId: current.id,
          startsOn: current.startsOn,
          endsOn: current.endsOn,
          remaining: current.stock,
          badge: current.badge,
          taxType: current.taxType,
        },
      ],
    });
    p.previewPromotion(
      withLivePromotions(
        {
          id: `preview-${current.id}`,
          documentId: current.id,
          version: 0,
          revision: current.revision,
          publishedAt: new Date().toISOString(),
          content,
          unavailablePromotions: [],
        },
        [current],
      ),
    );
  }
  const visible = p.promotions.filter(
    (x) =>
      filter === "all" ||
      (filter === "active" && active(x)) ||
      (filter === "soon" && active(x) && x.endsOn <= soon) ||
      (filter === "low" && active(x) && x.stock !== null && x.stock <= 10) ||
      (filter === "ended" && (today > x.endsOn || x.stock === 0)),
  );
  return (
    <fieldset disabled={p.busy} className="pricing-no-print min-w-0 space-y-5">
      <section className="maju-section-card space-y-3 p-4">
        <h2 className="text-lg font-bold">행사·임박 상품</h2>
        <div className="flex flex-wrap gap-2">
          {[
            ["all", "전체", p.promotions.length],
            ["active", "진행 중", p.promotions.filter(active).length],
            [
              "soon",
              "7일 내 종료",
              p.promotions.filter((x) => active(x) && x.endsOn <= soon).length,
            ],
            [
              "low",
              "재고 10개 이하",
              p.promotions.filter(
                (x) => active(x) && x.stock !== null && x.stock <= 10,
              ).length,
            ],
            [
              "ended",
              "종료·품절",
              p.promotions.filter((x) => today > x.endsOn || x.stock === 0)
                .length,
            ],
          ].map(([id, label, n]) => (
            <button
              key={id}
              className={`${box} ${filter === id ? "bg-blue-50" : ""}`}
              onClick={() => setFilter(String(id))}
            >
              {label} {n}
            </button>
          ))}
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-100">
              <tr>
                {[
                  "상태",
                  "노출 상품명",
                  ...(p.manager
                    ? [
                        "관리 상품명",
                        "행사 / 일반 매입가",
                        "마진율(매입가 대비)",
                      ]
                    : []),
                  "판매가",
                  "기간",
                  "남은 수량 / 매장별 최대",
                  "동작",
                ].map((t) => (
                  <th key={t} className="p-2">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((x) => (
                <tr key={x.id} className="border-t">
                  <td className="p-2">
                    {x.badge} ·{" "}
                    {active(x)
                      ? "진행 중"
                      : today < x.startsOn
                        ? "예정"
                        : "종료·주문 불가"}
                  </td>
                  <td className="p-2">{x.displayName}</td>
                  {p.manager && (
                    <>
                      <td className="p-2">{x.name}</td>
                      <td className="p-2">
                        {x.cost?.toLocaleString()} /{" "}
                        {x.regularCost?.toLocaleString()}원
                      </td>
                      <td className="p-2">{x.margin}%</td>
                    </>
                  )}
                  <td className="p-2">{x.price.toLocaleString()}원</td>
                  <td className="p-2">
                    {x.startsOn} ~ {x.endsOn}
                  </td>
                  <td className="p-2">
                    {x.stock ?? "미설정"} / {x.perStoreLimit ?? "제한 없음"}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        className={box}
                        onClick={() => void p.run(() => preview(x))}
                      >
                        미리보기
                      </button>
                      <button
                        className={box}
                        disabled={!active(x)}
                        onClick={() => void p.run(() => p.addPromotion(x))}
                      >
                        문서에 추가
                      </button>
                      {p.manager && (
                        <>
                          <button
                            className={box}
                            onClick={() => setEditPromo(x)}
                          >
                            수정
                          </button>
                          <button
                            className={box}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "행사를 삭제할까요? 기존 확정본에서도 이 행사 줄은 표시하지 않습니다.",
                                )
                              )
                                void p.run(async () => {
                                  await documentRequest(
                                    p.companyId,
                                    "delete-promotion",
                                    { id: x.id, expected: x.revision },
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p.manager && (
          <>
            <button
              className={box}
              onClick={() => {
                setEditPromo(null);
                setPromoFormKey((k) => k + 1);
              }}
            >
              새 행사 등록
            </button>
            <button className={box} onClick={() => void p.run(p.reload)}>
              행사·묶음 새로고침
            </button>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const q = String(new FormData(e.currentTarget).get("q") || "");
                void p.run(async () => {
                  const r = await documentRequest<{ items: CatalogChoice[] }>(
                    p.companyId,
                    "catalog",
                    { search: q },
                  );
                  setChoices(r.result.items);
                });
              }}
            >
              <input
                name="q"
                aria-label="행사 기본 상품 검색"
                placeholder="일반 상품 검색"
                maxLength={100}
                className={box}
              />
              <button className={box}>상품 찾기</button>
            </form>
            <form
              key={`${editPromo?.id || "new-promo"}-${editPromo?.revision || 0}-${promoFormKey}`}
              className="grid gap-3 md:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void p.run(async () => {
                  await documentRequest(
                    p.companyId,
                    "save-promotion",
                    {
                      id: editPromo?.id || crypto.randomUUID(),
                      expected: editPromo?.revision || 0,
                      content: {
                        productId: String(data.get("productId")),
                        name: String(data.get("name")),
                        displayName: String(data.get("displayName")),
                        startsOn: String(data.get("startsOn")),
                        endsOn: String(data.get("endsOn")),
                        cost: Number(data.get("cost")),
                        margin: Number(data.get("margin")),
                        stock:
                          data.get("stock") === ""
                            ? null
                            : Number(data.get("stock")),
                        perStoreLimit:
                          data.get("perStoreLimit") === ""
                            ? null
                            : Number(data.get("perStoreLimit")),
                        allowSheet: data.get("allowSheet") === "on",
                        badge: String(data.get("badge")),
                        taxType: String(data.get("taxType")),
                      },
                    },
                    true,
                  );
                  await p.reload();
                  setEditPromo(null);
                  setPromoFormKey((k) => k + 1);
                });
              }}
            >
              <label>
                연결할 일반 상품
                <select
                  name="productId"
                  required
                  defaultValue={editPromo?.productId || ""}
                  className={`${box} block w-full`}
                >
                  <option value="">선택</option>
                  {Array.from(
                    new Map(
                      [...choices, ...p.catalog].map((i) => [i.id, i]),
                    ).values(),
                  ).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                관리 상품명(직원용)
                <input
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={editPromo?.name || ""}
                  className={`${box} block w-full`}
                />
              </label>
              <label>
                노출 상품명(매장용)
                <input
                  name="displayName"
                  required
                  maxLength={120}
                  defaultValue={editPromo?.displayName || ""}
                  className={`${box} block w-full`}
                />
              </label>
              <label>
                시작일
                <input
                  name="startsOn"
                  required
                  type="date"
                  defaultValue={editPromo?.startsOn || today}
                  className={`${box} block w-full`}
                />
              </label>
              <label>
                종료일
                <input
                  name="endsOn"
                  required
                  type="date"
                  defaultValue={editPromo?.endsOn || soon}
                  className={`${box} block w-full`}
                />
              </label>
              <div className="md:col-span-3 flex flex-wrap gap-2">
                {[7, 10, 15, 20, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={box}
                    onClick={(e) => {
                      const form = e.currentTarget.form;
                      if (!form) return;
                      const start = form.elements.namedItem("startsOn"),
                        end = form.elements.namedItem("endsOn");
                      if (
                        start instanceof HTMLInputElement &&
                        end instanceof HTMLInputElement &&
                        start.value
                      ) {
                        end.value = new Date(
                          Date.parse(start.value + "T00:00:00Z") +
                            (days - 1) * 86400000,
                        )
                          .toISOString()
                          .slice(0, 10);
                      }
                    }}
                  >
                    {days}일 기간
                  </button>
                ))}
              </div>
              <label>
                구분
                <select
                  name="badge"
                  defaultValue={editPromo?.badge || "행사"}
                  className={`${box} block w-full`}
                >
                  <option>행사</option>
                  <option>임박</option>
                </select>
              </label>
              <label>
                행사 매입가
                <input
                  name="cost"
                  type="number"
                  min="0"
                  max="999999999999.99"
                  step="0.01"
                  required
                  defaultValue={editPromo?.cost ?? 0}
                  className={`${box} block w-full`}
                />
              </label>
              <label>
                마진율(매입가 대비) %
                <input
                  name="margin"
                  type="number"
                  min="0"
                  max="1000"
                  step="0.01"
                  required
                  defaultValue={editPromo?.margin ?? 12}
                  className={`${box} block w-full`}
                />
              </label>
              <label>
                과세
                <select
                  name="taxType"
                  defaultValue={editPromo?.taxType || ""}
                  required
                  className={`${box} block w-full`}
                >
                  <option value="">확인 후 선택</option>
                  <option value="taxable">과세</option>
                  <option value="exempt">면세</option>
                </select>
              </label>
              <label>
                행사 재고(선택)
                <input
                  name="stock"
                  type="number"
                  min="0"
                  max="1000000000000"
                  step="1"
                  defaultValue={editPromo?.stock ?? ""}
                  className={`${box} block w-full`}
                />
              </label>
              <label>
                매장 1곳당 최대 수량(선택)
                <input
                  name="perStoreLimit"
                  type="number"
                  min="1"
                  max="1000000000000"
                  step="1"
                  defaultValue={editPromo?.perStoreLimit ?? ""}
                  className={`${box} block w-full`}
                />
              </label>
              <label className="self-center">
                <input
                  name="allowSheet"
                  type="checkbox"
                  defaultChecked={editPromo?.allowSheet ?? false}
                />{" "}
                단가표에도 표시 허용
              </label>
              <button className={`${box} bg-slate-900 text-white`}>
                {editPromo ? "행사 수정 저장" : "행사 등록"}
              </button>
            </form>
            <p className="text-sm text-slate-600">
              판매가는 10원 단위로 올림합니다. 종료·재고 0인 행사는 문서
              미리보기와 출력에서 자동 제외합니다.
            </p>
          </>
        )}
      </section>
      <section className="maju-section-card space-y-3 p-4">
        <h2 className="text-lg font-bold">묶음·템플릿</h2>
        <p className="text-sm text-slate-600">
          품목과 순서만 저장합니다. 불러올 때 현재 회사 가격 규칙으로 다시
          계산합니다.
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
              <option value="template">템플릿</option>
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
