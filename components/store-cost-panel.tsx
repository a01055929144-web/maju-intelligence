"use client";

import { useCallback, useEffect, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { StoreCostUploadPanel } from "./store-cost-upload-panel";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { validateStoreCostInput } from "@/domains/store-cost/store-cost";

export type StoreCostAccess = { companyId: string; storeAccountId: string; canManage: boolean } | { message: string } | null;
type Search = { product: string; from: string; to: string };
type CostPage = { rows: Cost[]; hasMore: boolean; nextOffset: number | null };
type Cost = { id: string; revision: number; productName: string; specification: string; unit: string; effectiveOn: string; costKrw: number };
const control = "mt-1 min-h-[44px] w-full rounded border p-2";

function failure(status: number) {
  if (status === 401) return "매장 구성원 로그인을 확인한 뒤 새로고침해 주세요.";
  if (status === 403) return "이 작업의 권한이 없습니다. 점주에게 권한을 확인한 뒤 새로고침해 주세요.";
  if (status === 404) return "원가관리 기능 또는 자료를 사용할 수 없습니다. 담당자에게 확인해 주세요.";
  if (status === 409) return "다른 구성원이 먼저 수정했습니다. 다시 조회한 뒤 최신 자료를 수정해 주세요.";
  return "원가 자료를 불러오거나 저장하지 못했습니다. 다시 조회해 주세요.";
}

export function StoreCostPanel({ access }: { access: StoreCostAccess }) {
  const [rows, setRows] = useState<Cost[]>([]);
  const [history, setHistory] = useState<{ itemId: string; name: string; rows: Cost[]; nextOffset: number | null } | null>(null);
  const [editing, setEditing] = useState<Cost | null>(null);
  const [product, setProduct] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [applied, setApplied] = useState<Search>({ product: "", from: "", to: "" });
  const scope = access && "companyId" in access ? access : null;
  const companyId = scope?.companyId, storeAccountId = scope?.storeAccountId;

  const load = useCallback(async (filters: Search = { product: "", from: "", to: "" }, offset = 0) => {
    if (!companyId || !storeAccountId) return;
    setBusy(true); setError(""); setHistory(null); setEditing(null);
    if (offset === 0) { setRows([]); setLoaded(false); setNextOffset(null); setApplied(filters); }
    try {
      const query = new URLSearchParams({ companyId, storeAccountId, ...filters, offset: String(offset) });
      const response = await fetch(`/api/store/costs?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error(failure(response.status));
      const result = await response.json() as CostPage;
      setRows(previous => Array.from(new Map([...(offset ? previous : []), ...result.rows].map(row => [row.id, row])).values()));
      setNextOffset(result.hasMore && result.nextOffset !== null && result.nextOffset > offset ? result.nextOffset : null);
      setLoaded(true);
    } catch (error) { setRows([]); setLoaded(false); setNextOffset(null); setError(error instanceof Error ? error.message : failure(503)); }
    finally { setBusy(false); }
  }, [companyId, storeAccountId]);
  useEffect(() => { void load(); }, [load]);

  async function showHistory(row: Pick<Cost, "id" | "productName">, offset = 0) {
    if (!scope) return;
    setBusy(true); setError(""); if (!offset) setHistory(null); setEditing(null); setNotice("");
    try {
      const query = new URLSearchParams({ companyId: scope.companyId, storeAccountId: scope.storeAccountId, itemId: row.id, history: "true", offset: String(offset) });
      const response = await fetch(`/api/store/costs?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error(failure(response.status));
      const result = await response.json() as CostPage;
      setHistory(previous => ({ itemId: row.id, name: row.productName,
        rows: Array.from(new Map([...(offset && previous?.itemId === row.id ? previous.rows : []), ...result.rows].map(item => [item.id, item])).values()),
        nextOffset: result.hasMore && result.nextOffset !== null && result.nextOffset > offset ? result.nextOffset : null }));
    } catch (error) { setRows([]); setHistory(null); setLoaded(false); setNextOffset(null); setError(error instanceof Error ? error.message : failure(503)); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!editing || !scope?.canManage || busy) return;
    try { validateStoreCostInput(editing); }
    catch { setError("일자·품목명·단위와 0~10억 원 사이의 정수 원가를 확인해 주세요."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const { id, revision, ...row } = editing;
      const response = await fetch("/api/store/costs", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: scope.companyId, storeAccountId: scope.storeAccountId, itemId: id, expectedRevision: revision, row }) });
      if (!response.ok) throw new Error(failure(response.status));
      setNotice("원가를 저장했습니다. 최신 목록을 확인해 주세요.");
      await load(applied);
    } catch (error) {
      setRows([]); setLoaded(false); setEditing(null);
      setError(error instanceof Error ? error.message : failure(503));
    } finally { setBusy(false); }
  }

  const columns: CommonTableColumn<Cost>[] = [
    { key: "effectiveOn", label: "적용일", value: row => row.effectiveOn },
    { key: "productName", label: "품목명", value: row => row.productName },
    { key: "specification", label: "규격", value: row => row.specification },
    { key: "unit", label: "단위", value: row => row.unit },
    { key: "costKrw", label: "매장 원가 (원)", value: row => row.costKrw, align: "right" },
    { key: "revision", label: "수정 차수", value: row => row.revision },
  ];
  const listColumns: CommonTableColumn<Cost>[] = [...columns, { key: "actions", label: "동작", value: () => "", sortable: false,
    render: row => <div className="flex gap-2"><Button className="min-h-[44px]" variant="outline" disabled={busy} onClick={() => void showHistory(row)}>이력</Button>
      {scope?.canManage && <Button className="min-h-[44px]" variant="outline" disabled={busy} onClick={() => { setEditing({ ...row }); setHistory(null); setError(""); setNotice(""); }}>수정</Button>}</div> }];

  if (!access) return null;
  return <Card>
    <CardHeader><CardTitle>매장 자체 원가관리</CardTitle><p className="text-sm text-slate-600">매장에서 등록한 원가 자료입니다. 원가 조회와 수정은 PC에서 이용해 주세요.</p></CardHeader>
    <CardContent>
      {"message" in access && <p role="status">{access.message} 권한을 확인한 뒤 새로고침해 주세요.</p>}
      {error && <p role="alert">{error}</p>}
      <p className="md:hidden">PC에서 같은 매장 주소를 열어 주세요. 주문과 판매가 변동은 기존 메뉴에서 확인할 수 있습니다.</p>
      <div className="hidden space-y-4 md:block">
        {!("message" in access) && <>
          <p className="text-sm">{access.canManage ? "점주·관리자는 단건 원가를 수정할 수 있습니다." : "직원은 원가를 조회할 수 있습니다. 수정은 점주·관리자에게 요청해 주세요."}</p>
          {access.canManage && <Button className="min-h-[44px]" variant="outline" disabled={busy || showUpload} onClick={() => { setShowUpload(true); setEditing(null); setHistory(null); setNotice(""); }}>엑셀 원가 업로드</Button>}
          {access.canManage && showUpload && <StoreCostUploadPanel companyId={access.companyId} storeAccountId={access.storeAccountId}
            onClose={() => setShowUpload(false)} onSaved={message => { setShowUpload(false); setNotice(message); void load(applied); }} />}
          <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setNotice(""); void load({ product, from, to }); }}>
            <label className="text-sm">품목명<input className={control} value={product} maxLength={200} disabled={busy} onChange={event => setProduct(event.target.value)} /></label>
            <label className="text-sm">시작일<input className={control} type="date" value={from} max={to || undefined} disabled={busy} onChange={event => setFrom(event.target.value)} /></label>
            <label className="text-sm">종료일<input className={control} type="date" value={to} min={from || undefined} disabled={busy} onChange={event => setTo(event.target.value)} /></label>
            <Button className="min-h-[44px]" type="submit" disabled={busy}>다시 조회</Button>
          </form>
          <div aria-live="polite">{busy && <p>원가 자료를 확인 중입니다.</p>}{notice && <p role="status">{notice}</p>}</div>
          {loaded && !busy && <><p className="text-sm">현재 불러온 행 {rows.length}건 · 엑셀 내려받기에는 이 행만 포함됩니다.</p><CommonDataTable columns={listColumns} rows={rows} rowKey={row => row.id} settingsKey={`store-costs:${access.companyId}:${access.storeAccountId}`}
            filename="매장-원가-현재불러온행.csv" emptyMessage="등록된 원가가 없습니다. 검색 조건을 바꾸거나 점주에게 자료 등록을 요청해 주세요." />
            {nextOffset !== null && <Button className="min-h-[44px]" variant="outline" disabled={busy} onClick={() => void load(applied, nextOffset)}>원가 더 보기</Button>}</>}
          {history && !busy && <section aria-label="원가 변경 이력"><h4 className="font-semibold">{history.name} 변경 이력</h4>
            <p className="text-sm">이력 엑셀 내려받기에도 현재 불러온 행만 포함됩니다.</p>
            <CommonDataTable filename="매장-원가이력-현재불러온행.csv" columns={columns} rows={history.rows} rowKey={row => row.id} settingsKey="store-cost-history" emptyMessage="변경 이력이 없습니다. 목록에서 다른 품목을 확인해 주세요." />
            {history.nextOffset !== null && <Button className="min-h-[44px]" variant="outline" disabled={busy} onClick={() => void showHistory({ id: history.itemId, productName: history.name }, history.nextOffset!)}>이력 더 보기</Button>}</section>}
          {editing && <form aria-label="원가 수정" className="space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
            <h4 className="font-semibold">원가 수정 · {editing.productName}</h4>
            <fieldset disabled={busy} className="grid grid-cols-3 gap-3">
              {(["productName", "specification", "unit", "effectiveOn", "costKrw"] as const).map((key, index) => <label key={key} className="text-sm">
                {["수정 품목명", "수정 규격", "수정 단위", "수정 적용일", "수정 원가 (원)"][index]}
                <input className={control} type={key === "costKrw" ? "number" : key === "effectiveOn" ? "date" : "text"} required={key !== "specification"}
                  min={key === "costKrw" ? 0 : undefined} max={key === "costKrw" ? 1_000_000_000 : undefined} step={key === "costKrw" ? 1 : undefined}
                  maxLength={key === "unit" ? 40 : 200} value={key === "costKrw" && !Number.isFinite(editing.costKrw) ? "" : editing[key]} onChange={event => setEditing({ ...editing, [key]: key === "costKrw" ? (event.target.value === "" ? NaN : Number(event.target.value)) : event.target.value })} />
              </label>)}
            </fieldset>
            <div className="flex gap-2"><Button className="min-h-[44px]" type="submit" disabled={busy}>원가 저장</Button><Button className="min-h-[44px]" variant="outline" type="button" disabled={busy} onClick={() => { setEditing(null); setError(""); }}>취소</Button></div>
          </form>}
        </>}
      </div>
    </CardContent>
  </Card>;
}
