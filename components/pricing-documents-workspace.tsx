"use client";
import { useCallback, useEffect, useState } from "react";
import { documentRequest } from "@/lib/pricing/document-client";
import {
  koreaDay,
  lineFromCatalog,
  parseDocument,
  withMargin,
  type CatalogChoice,
  type DocumentContent,
  type DocumentDraft,
  type DocumentKind,
  type DocumentVersion,
  type PrintLine,
  type ProductSet,
  type Promotion,
  withLivePromotions,
} from "@/domains/pricing/document";
import { PricingDocumentPreview } from "./pricing-document-preview";
import { PricingDocumentLibrary } from "./pricing-document-library";
const box = "rounded border border-slate-300 px-3 py-2";
type Profile = {
  revision: number;
  content: { companyName: string; contact: string; footer: string };
};
export function PricingDocumentsWorkspace({
  companyId,
  manager,
}: {
  companyId: string;
  manager: boolean;
}) {
  const [docs, setDocs] = useState<DocumentDraft[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const [draft, setDraft] = useState<DocumentDraft | null>(null),
    [dirty, setDirty] = useState(false),
    [versions, setVersions] = useState<DocumentVersion[]>([]),
    [preview, setPreview] = useState<DocumentVersion | null>(null);
  const [catalog, setCatalog] = useState<CatalogChoice[]>([]),
    [catalogQuery, setCatalogQuery] = useState(""),
    [catalogInput, setCatalogInput] = useState(""),
    [catalogPage, setCatalogPage] = useState(1),
    [catalogTotal, setCatalogTotal] = useState(0);
  const [sets, setSets] = useState<ProductSet[]>([]),
    [promotions, setPromotions] = useState<Promotion[]>([]),
    [profile, setProfile] = useState<Profile>({
      revision: 0,
      content: { companyName: "", contact: "", footer: "" },
    });
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("documents");
  const [bulkMargin, setBulkMargin] = useState("12"),
    [baselines, setBaselines] = useState<Record<string, number>>({});
  const read = useCallback(
    <T,>(action: string, payload: Record<string, unknown> = {}) =>
      documentRequest<T>(companyId, action, payload).then((r) => r.result),
    [companyId],
  );
  const loadList = useCallback(async () => {
    const r = await read<{ items: DocumentDraft[]; total: number }>("list", {
      page,
      search,
    });
    setDocs(r.items);
    setTotal(r.total);
  }, [read, page, search]);
  const loadLibrary = useCallback(async () => {
    const [s, p, h] = await Promise.all([
      read<ProductSet[]>("sets"),
      read<Promotion[]>("promotions"),
      read<Profile>("profile"),
    ]);
    setSets(s);
    setPromotions(p);
    setProfile(h);
  }, [read]);
  async function task(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    setBusy(true);
    void loadList()
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "목록을 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [loadList]);
  useEffect(() => {
    void loadLibrary().catch((e) =>
      setError(
        e instanceof Error ? e.message : "기본값을 불러오지 못했습니다.",
      ),
    );
  }, [loadLibrary]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function change(content: DocumentContent) {
    if (draft) {
      setDraft({ ...draft, content });
      setDirty(true);
      setPreview(null);
    }
  }
  function rows(lines: PrintLine[]) {
    if (draft) change({ ...draft.content, lines });
  }
  function discard() {
    return !dirty || window.confirm("저장하지 않은 변경을 버리고 이동할까요?");
  }
  function create(kind: DocumentKind, content?: DocumentContent) {
    if (!discard()) return;
    const basis: Record<string, number> = {};
    for (const l of content?.lines || []) basis[l.productId] = l.price;
    setBaselines(basis);
    setDraft({
      id: crypto.randomUUID(),
      revision: 0,
      updatedAt: "",
      content: content
        ? { ...structuredClone(content), kind }
        : {
            kind,
            title: kind === "sheet" ? "단가표" : "식자재 견적서",
            ...profile.content,
            recipient: "",
            validUntil: koreaDay(new Date(Date.now() + 14 * 86400000)),
            theme: "blue",
            layout: "auto",
            showPrice: true,
            showBrand: true,
            showSpec: true,
            lines: [],
          },
    });
    setDirty(true);
    setPreview(null);
    setVersions([]);
    setTab("documents");
  }
  async function select(d: DocumentDraft) {
    if (!discard()) return;
    setDraft(structuredClone(d));
    setDirty(false);
    setPreview(null);
    setVersions(await read<DocumentVersion[]>("versions", { id: d.id }));
    const products = await read<{ items: CatalogChoice[] }>("catalog", {
      productIds: Array.from(new Set(d.content.lines.map((l) => l.productId))),
    });
    const basis: Record<string, number> = {};
    for (const p of products.items) basis[p.id] = p.price;
    setBaselines(basis);
  }
  async function save() {
    if (!draft) return;
    const content = parseDocument(draft.content);
    const r = await documentRequest<DocumentDraft>(
      companyId,
      "save",
      { id: draft.id, expected: draft.revision, content },
      true,
    );
    setDraft(r.result);
    setDirty(false);
    setMessage("초안을 저장했습니다.");
    await loadList();
  }
  async function publish() {
    if (!draft || dirty) return;
    const r = await documentRequest<DocumentVersion>(
      companyId,
      "publish",
      { id: draft.id, expected: draft.revision },
      true,
    );
    setPreview(r.result);
    setVersions(await read<DocumentVersion[]>("versions", { id: draft.id }));
    setMessage(`버전 ${r.result.version}을 확정했습니다.`);
  }
  useEffect(() => {
    let active = true;
    void read<{ items: CatalogChoice[]; total: number }>("catalog", {
      search: catalogQuery,
      page: catalogPage,
    })
      .then((r) => {
        if (active) {
          setCatalog(r.items);
          setCatalogTotal(r.total);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "품목을 불러오지 못했습니다.",
          );
      });
    return () => {
      active = false;
    };
  }, [read, catalogQuery, catalogPage]);
  function add(items: CatalogChoice[]) {
    if (!draft) return;
    setBaselines((previous) => {
      const next = { ...previous };
      for (const i of items) next[i.id] = i.price;
      return next;
    });
    const keys = new Set(
      draft.content.lines.map((l) => `${l.productId}:${l.promotionId}`),
    );
    const appended = items
      .filter((i) => !keys.has(`${i.id}:null`))
      .map(lineFromCatalog);
    if (draft.content.lines.length + appended.length > 100)
      throw new Error("문서당 최대 100개 품목을 담을 수 있습니다.");
    rows([...draft.content.lines, ...appended]);
  }
  async function loadSet(s: ProductSet) {
    const r = await read<{ items: CatalogChoice[] }>("catalog", {
      productIds: s.productIds,
    });
    if (r.items.length !== s.productIds.length)
      throw new Error("활성 상품·노출 상품명 설정을 확인해 주세요.");
    const byId = new Map(r.items.map((i) => [i.id, i]));
    add(s.productIds.map((id) => byId.get(id)!));
    setTab("documents");
  }
  async function addPromotion(p: Promotion) {
    if (!draft) throw new Error("먼저 문서를 작성해 주세요.");
    if (draft.content.kind === "sheet" && !p.allowSheet)
      throw new Error("이 행사는 견적서에만 넣을 수 있습니다.");
    if (draft.content.lines.some((l) => l.promotionId === p.id)) return;
    const r = await read<{ items: CatalogChoice[] }>("catalog", {
      productIds: [p.productId],
    });
    if (!r.items[0]) throw new Error("행사 상품을 확인해 주세요.");
    setBaselines((previous) => ({
      ...previous,
      [p.productId]: r.items[0].price,
    }));
    rows([
      ...draft.content.lines,
      {
        ...lineFromCatalog(r.items[0]),
        displayName: p.displayName,
        price: p.price,
        promotionId: p.id,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        remaining: p.stock,
        badge: p.badge,
        taxType: p.taxType,
      },
    ]);
    setTab("documents");
  }
  async function applyMargin(index?: number) {
    if (!draft || !draft.content.lines.length) return;
    const ids = Array.from(
      new Set(
        draft.content.lines
          .filter((l) => !l.promotionId)
          .map((l) => l.productId),
      ),
    );
    const r = await read<{ items: CatalogChoice[] }>("catalog", {
      productIds: ids,
    });
    const byId = new Map(r.items.map((i) => [i.id, i]));
    const entered =
      index === undefined
        ? bulkMargin
        : window.prompt("마진율(매입가 대비) 0~1000%", bulkMargin);
    if (entered === null) return;
    const rate = Number(entered);
    rows(
      draft.content.lines.map((l, i) => {
        if (l.promotionId || (index !== undefined && i !== index)) return l;
        const item = byId.get(l.productId);
        if (item?.cost === undefined)
          throw new Error("매입가 확인 권한이 필요합니다.");
        return withMargin(l, item.cost, rate);
      }),
    );
  }
  function move(i: number, delta: number) {
    if (!draft) return;
    const next = [...draft.content.lines],
      j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    rows(next);
  }
  const editable = Boolean(
    draft && (draft.content.kind === "quote" || manager),
  );
  return (
    <div className="space-y-5" aria-busy={busy}>
      <header className="pricing-no-print">
        <h1 className="text-2xl font-bold">견적서·단가표</h1>
        <p className="text-sm text-slate-600">
          초안을 저장한 뒤 버전을 확정해 온라인·오프라인 미리보기에서
          확인하세요. 견적서는 작성자에게만 보입니다.
        </p>
      </header>
      {error && (
        <p
          role="alert"
          className="pricing-no-print rounded bg-red-50 p-3 text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="pricing-no-print">
          {message}
        </p>
      )}
      <div className="pricing-no-print flex flex-wrap gap-2">
        {[
          ["documents", "문서 작성"],
          ["library", "행사·묶음·템플릿"],
          ["profile", "인쇄 기본값"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`${box} ${tab === id ? "bg-slate-900 text-white" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "profile" && (
        <form
          className="pricing-no-print maju-section-card space-y-3 p-4"
          key={profile.revision}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void task(async () => {
              await documentRequest(
                companyId,
                "save-profile",
                {
                  id: companyId,
                  expected: profile.revision,
                  content: {
                    companyName: String(data.get("companyName")),
                    contact: String(data.get("contact")),
                    footer: String(data.get("footer")),
                  },
                },
                true,
              );
              await loadLibrary();
              setMessage("회사 인쇄 기본값을 저장했습니다.");
            });
          }}
        >
          <h2 className="font-bold">회사 인쇄 기본값</h2>
          {(
            [
              ["companyName", "회사명"],
              ["contact", "담당·연락처"],
              ["footer", "마감·배송·최소 주문·시세 안내"],
            ] as const
          ).map(([key, label]) => (
            <label className="block" key={key}>
              {label}
              <input
                name={key}
                disabled={!manager}
                defaultValue={profile.content[key]}
                required={key === "companyName"}
                maxLength={key === "footer" ? 400 : 100}
                className={`${box} ml-2 w-full max-w-xl`}
              />
            </label>
          ))}
          <button disabled={busy || !manager} className={box}>
            기본값 저장
          </button>
          <p className="text-sm">
            새 문서에 적용되며 이미 확정된 버전은 바뀌지 않습니다.
          </p>
        </form>
      )}
      {tab === "library" && (
        <PricingDocumentLibrary
          companyId={companyId}
          manager={manager}
          sets={sets}
          promotions={promotions}
          selectedProductIds={
            draft?.content.lines.map((l) => l.productId) || []
          }
          run={task}
          reload={loadLibrary}
          loadSet={loadSet}
          addPromotion={addPromotion}
          previewPromotion={(version) => setPreview(version)}
          catalog={catalog}
          profile={profile.content}
          busy={busy}
        />
      )}
      {tab === "documents" && (
        <div className="pricing-no-print grid items-start gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="space-y-3 lg:sticky lg:top-4">
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy}
                className={box}
                onClick={() => create("quote")}
              >
                + 견적서
              </button>
              {manager && (
                <button
                  disabled={busy}
                  className={box}
                  onClick={() => create("sheet")}
                >
                  + 단가표
                </button>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(String(new FormData(e.currentTarget).get("q") || ""));
                setPage(1);
              }}
            >
              <input
                name="q"
                placeholder="문서명 검색"
                aria-label="문서명 검색"
                className={`${box} w-full`}
                maxLength={100}
              />
              <button className={box}>검색</button>
            </form>
            <button
              className={box}
              disabled={busy}
              onClick={() => void task(loadList)}
            >
              목록 새로고침
            </button>
            <p>
              {total}개 · {page}페이지
            </p>
            <div className="max-h-[60vh] space-y-2 overflow-auto">
              {docs.map((d) => (
                <button
                  key={d.id}
                  disabled={busy}
                  onClick={() => void task(() => select(d))}
                  className={`${box} block w-full text-left ${draft?.id === d.id ? "bg-blue-50" : ""}`}
                >
                  <strong>{d.content.title}</strong>
                  <span className="block text-sm">
                    {d.content.kind === "sheet" ? "단가표" : "견적서"} ·{" "}
                    {d.content.lines.length}개
                  </span>
                  <span className="block text-xs">
                    {d.content.validUntil}
                    {koreaDay() > d.content.validUntil ? " 만료" : "까지"}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                disabled={busy || page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className={box}
              >
                이전
              </button>
              <button
                disabled={busy || page * 50 >= total}
                onClick={() => setPage((p) => p + 1)}
                className={box}
              >
                다음
              </button>
            </div>
          </aside>
          <section className="min-w-0 space-y-4">
            {!draft ? (
              <p className="rounded border p-8">
                문서를 선택하거나 새로 작성하세요.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <span className="font-semibold">
                    {draft.content.kind === "sheet"
                      ? "단가표"
                      : "작성자 전용 견적서"}{" "}
                    ·{" "}
                    {dirty ? "저장 안 된 변경 있음" : `저장 ${draft.revision}`}
                  </span>
                  <button
                    disabled={
                      busy ||
                      !editable ||
                      draft.content.lines.some((l) => l.taxType === "unknown")
                    }
                    onClick={() => void task(save)}
                    className={box}
                  >
                    초안 저장
                  </button>
                  <button
                    disabled={busy || dirty || !draft.revision || !editable}
                    onClick={() => void task(publish)}
                    className={`${box} bg-blue-700 text-white`}
                  >
                    판매가 버전 확정
                  </button>
                  <button
                    disabled={busy}
                    className={box}
                    onClick={() =>
                      void task(async () => {
                        const content = parseDocument(draft.content),
                          p = await read<Promotion[]>("promotions");
                        setPreview(
                          withLivePromotions(
                            {
                              id: `preview-${draft.id}`,
                              documentId: draft.id,
                              version: 0,
                              revision: draft.revision,
                              publishedAt: new Date().toISOString(),
                              content,
                              unavailablePromotions: [],
                            },
                            p,
                          ),
                        );
                      })
                    }
                  >
                    작성 중 미리보기
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => create("quote", draft.content)}
                    className={box}
                  >
                    견적서로 복사
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {(
                    [
                      ["title", "문서 제목"],
                      ["companyName", "회사명"],
                      ["contact", "담당·연락처"],
                      ["recipient", "받는 곳"],
                      ["validUntil", "유효기간"],
                      ["footer", "하단 안내"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      {label}
                      <input
                        disabled={!editable}
                        type={key === "validUntil" ? "date" : "text"}
                        value={draft.content[key]}
                        onChange={(e) =>
                          change({ ...draft.content, [key]: e.target.value })
                        }
                        className={`${box} block w-full`}
                        maxLength={key === "footer" ? 400 : 100}
                      />
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label>
                    테마
                    <select
                      disabled={!editable}
                      value={draft.content.theme}
                      onChange={(e) =>
                        change({
                          ...draft.content,
                          theme: e.target.value as DocumentContent["theme"],
                        })
                      }
                      className={box}
                    >
                      <option value="blue">청색</option>
                      <option value="green">녹색</option>
                      <option value="mono">흑백</option>
                    </select>
                  </label>
                  <label>
                    형식
                    <select
                      disabled={!editable}
                      value={draft.content.layout}
                      onChange={(e) =>
                        change({
                          ...draft.content,
                          layout: e.target.value as DocumentContent["layout"],
                        })
                      }
                      className={box}
                    >
                      <option value="auto">자동(20개 초과 표)</option>
                      <option value="table">표형</option>
                      <option value="cards">카드형</option>
                    </select>
                  </label>
                  {(
                    [
                      ["showPrice", "단가"],
                      ["showBrand", "브랜드"],
                      ["showSpec", "규격·단위"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      <input
                        disabled={!editable}
                        type="checkbox"
                        checked={draft.content[key]}
                        onChange={(e) =>
                          change({ ...draft.content, [key]: e.target.checked })
                        }
                      />{" "}
                      {label}
                    </label>
                  ))}
                </div>
                {editable && (
                  <div className="space-y-2 rounded border p-3">
                    <form
                      className="flex flex-wrap gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setCatalogPage(1);
                        setCatalogQuery(catalogInput);
                      }}
                    >
                      <input
                        value={catalogInput}
                        onChange={(e) => setCatalogInput(e.target.value)}
                        placeholder={
                          manager ? "관리 상품명 검색" : "노출 상품명 검색"
                        }
                        aria-label="추가할 품목 검색"
                        className={box}
                        maxLength={100}
                      />
                      <button disabled={busy} className={box}>
                        품목 찾기
                      </button>
                    </form>
                    <div className="max-h-40 overflow-auto">
                      {catalog.map((item) => (
                        <button
                          key={item.id}
                          disabled={busy}
                          onClick={() => void task(async () => add([item]))}
                          className={`${box} m-1 text-left`}
                        >
                          {item.name}
                          {item.taxType === "unknown"
                            ? " (과세 확인 필요)"
                            : ""}{" "}
                          · {item.price.toLocaleString()}원{" "}
                          {manager && item.cost !== undefined
                            ? `(매입 ${item.cost.toLocaleString()}원)`
                            : ""}{" "}
                          +
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={catalogPage <= 1 || busy}
                        onClick={() => setCatalogPage((p) => p - 1)}
                        className={box}
                      >
                        품목 이전
                      </button>
                      <span>
                        {catalogPage} /{" "}
                        {Math.max(1, Math.ceil(catalogTotal / 50))}
                      </span>
                      <button
                        disabled={busy || catalogPage * 50 >= catalogTotal}
                        onClick={() => setCatalogPage((p) => p + 1)}
                        className={box}
                      >
                        품목 다음
                      </button>
                    </div>
                    <p className="text-xs">
                      노출 상품명이 없는 품목은 매장에 보일 이름을 직접 입력해
                      주세요. 관리 상품명은 출력에 자동 사용하지 않습니다.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {sets.map((s) => (
                        <button
                          key={s.id}
                          disabled={busy}
                          className={box}
                          onClick={() => void task(() => loadSet(s))}
                        >
                          {s.name} 불러오기
                        </button>
                      ))}
                      {promotions
                        .filter(
                          (p) =>
                            koreaDay() >= p.startsOn &&
                            koreaDay() <= p.endsOn &&
                            p.stock !== 0 &&
                            (draft.content.kind === "quote" || p.allowSheet),
                        )
                        .map((p) => (
                          <button
                            key={p.id}
                            className={box}
                            disabled={busy}
                            onClick={() => void task(() => addPromotion(p))}
                          >
                            {p.badge} {p.displayName} 추가
                          </button>
                        ))}
                    </div>
                    {manager && (
                      <div className="flex gap-2">
                        <label>
                          일괄 마진율(매입가 대비)
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            step="0.01"
                            value={bulkMargin}
                            onChange={(e) => setBulkMargin(e.target.value)}
                            className={`${box} w-24`}
                          />
                        </label>
                        <button
                          disabled={busy}
                          onClick={() => void task(() => applyMargin())}
                          className={box}
                        >
                          일괄 적용
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {draft.content.lines.some((l) => l.taxType === "unknown") && (
                  <p
                    role="status"
                    className="rounded border border-amber-400 bg-amber-50 p-3"
                  >
                    과세 미확정{" "}
                    {
                      draft.content.lines.filter((l) => l.taxType === "unknown")
                        .length
                    }
                    개 — 표의 과세 항목에서 과세·면세를 확인한 후 저장해 주세요.
                  </p>
                )}
                <div className="overflow-auto rounded border">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-100">
                      <tr>
                        {[
                          "순서·표시",
                          "노출 상품명 / 브랜드",
                          "규격·단위",
                          "과세",
                          "판매가",
                          "편집",
                        ].map((t) => (
                          <th key={t} className="p-2">
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.content.lines.map((l, i) => (
                        <tr
                          key={`${l.productId}:${l.promotionId}`}
                          className={`border-t ${l.price < (baselines[l.productId] ?? 0) ? "bg-orange-50 outline outline-1 outline-orange-300" : ""}`}
                        >
                          <td className="p-2">
                            <label>
                              <input
                                disabled={!editable}
                                type="checkbox"
                                checked={l.visible}
                                onChange={(e) =>
                                  rows(
                                    draft.content.lines.map((x, j) =>
                                      j === i
                                        ? { ...x, visible: e.target.checked }
                                        : x,
                                    ),
                                  )
                                }
                              />{" "}
                              {i + 1}
                            </label>
                          </td>
                          <td className="p-2">
                            {l.badge && (
                              <span className="text-amber-800">
                                {l.badge} · {l.endsOn}까지 ·{" "}
                                {l.remaining ?? "재고 미설정"}
                              </span>
                            )}
                            <input
                              aria-label={`품목 ${i + 1} 노출 상품명`}
                              disabled={!editable || !!l.promotionId}
                              value={l.displayName}
                              onChange={(e) =>
                                rows(
                                  draft.content.lines.map((x, j) =>
                                    j === i
                                      ? { ...x, displayName: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                              maxLength={120}
                              className={`${box} block w-full`}
                            />
                            <input
                              aria-label={`품목 ${i + 1} 브랜드`}
                              disabled={!editable}
                              value={l.brand}
                              onChange={(e) =>
                                rows(
                                  draft.content.lines.map((x, j) =>
                                    j === i
                                      ? { ...x, brand: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                              className={`${box} mt-1 w-full`}
                              maxLength={80}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              aria-label={`품목 ${i + 1} 규격`}
                              disabled={!editable}
                              value={l.spec}
                              onChange={(e) =>
                                rows(
                                  draft.content.lines.map((x, j) =>
                                    j === i
                                      ? { ...x, spec: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                              maxLength={80}
                              className={`${box} w-28`}
                            />
                            <input
                              aria-label={`품목 ${i + 1} 단위`}
                              disabled={!editable}
                              value={l.unit}
                              onChange={(e) =>
                                rows(
                                  draft.content.lines.map((x, j) =>
                                    j === i
                                      ? { ...x, unit: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                              maxLength={20}
                              className={`${box} mt-1 w-28`}
                            />
                          </td>
                          <td className="p-2">
                            <select
                              disabled={!editable}
                              aria-label={`품목 ${i + 1} 과세`}
                              value={l.taxType}
                              onChange={(e) =>
                                rows(
                                  draft.content.lines.map((x, j) =>
                                    j === i
                                      ? {
                                          ...x,
                                          taxType: e.target
                                            .value as PrintLine["taxType"],
                                        }
                                      : x,
                                  ),
                                )
                              }
                              className={box}
                            >
                              <option value="unknown">확인 필요</option>
                              <option value="taxable">과세</option>
                              <option value="exempt">면세</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              disabled={!editable || !!l.promotionId}
                              type="number"
                              min="0"
                              max="1000000000000"
                              step="1"
                              value={l.price}
                              aria-label={`품목 ${i + 1} 판매가`}
                              onChange={(e) =>
                                rows(
                                  draft.content.lines.map((x, j) =>
                                    j === i
                                      ? { ...x, price: Number(e.target.value) }
                                      : x,
                                  ),
                                )
                              }
                              className={`${box} w-32`}
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1">
                              <button
                                disabled={!editable || i === 0}
                                onClick={() => move(i, -1)}
                                className={box}
                                aria-label={`품목 ${i + 1} 위로`}
                              >
                                위
                              </button>
                              <button
                                disabled={
                                  !editable ||
                                  i === draft.content.lines.length - 1
                                }
                                onClick={() => move(i, 1)}
                                className={box}
                                aria-label={`품목 ${i + 1} 아래로`}
                              >
                                아래
                              </button>
                              <button
                                disabled={!editable}
                                onClick={() =>
                                  rows(
                                    draft.content.lines.filter(
                                      (_, j) => j !== i,
                                    ),
                                  )
                                }
                                className={box}
                              >
                                삭제
                              </button>
                              {manager && !l.promotionId && (
                                <button
                                  disabled={busy || !editable}
                                  onClick={() =>
                                    void task(() => applyMargin(i))
                                  }
                                  className={box}
                                >
                                  개별 마진
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  {draft.content.lines.length}개 품목 · 기준가보다 낮은 단가는
                  주황색으로 표시합니다.
                </p>
                <div className="flex flex-wrap gap-2">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      disabled={busy}
                      onClick={() =>
                        void task(async () => {
                          const current = await read<DocumentVersion[]>(
                            "versions",
                            { id: v.documentId },
                          );
                          const selected = current.find(
                            (item) => item.id === v.id,
                          );
                          if (!selected)
                            throw new Error("버전을 찾을 수 없습니다.");
                          setPreview(selected);
                        })
                      }
                      className={box}
                    >
                      버전 {v.version} 미리보기 · {v.publishedAt.slice(0, 10)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {preview && (
        <PricingDocumentPreview
          key={`${preview.id}-${preview.publishedAt}-${JSON.stringify(preview.promotionStock)}-${preview.unavailablePromotions.join(",")}`}
          version={preview}
          refresh={async () => {
            if (preview.id.startsWith("preview-")) {
              const promos = await read<Promotion[]>("promotions");
              return withLivePromotions(preview, promos);
            }
            const list = await read<DocumentVersion[]>("versions", {
              id: preview.documentId,
            });
            const found = list.find((v) => v.id === preview.id);
            if (!found) throw new Error("버전을 다시 선택해 주세요.");
            return found;
          }}
        />
      )}
    </div>
  );
}
