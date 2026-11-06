"use client";

import { useMemo, useRef, useState } from "react";
import { ExcelHeaderMappingPreview } from "./excel-mapping-preview";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { Button } from "./ui/button";
import { buildPurchaseSheet, type PurchaseSheet } from "@/domains/pricing/purchase-import";
import { STORE_COST_IMPORT_FIELDS, buildStoreCostImportConfirmRequest, buildStoreCostImportPreview,
  suggestStoreCostMapping, type StoreCostInput } from "@/domains/store-cost/store-cost";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

const fields = STORE_COST_IMPORT_FIELDS.map(field => ({ ...field, aliases: [...field.aliases] }));
type ServerPreview = { confirmationHash: string; importId: string; fileName: string; rows: StoreCostInput[] };
type SourceRow = { rowNumber: number; cells: readonly unknown[] };

function importError(status: number) {
  if (status === 401) return "매장 구성원 로그인을 확인한 뒤 다시 열어 주세요.";
  if (status === 403) return "원가 업로드는 점주·관리자만 가능합니다. 점주에게 권한을 확인해 주세요.";
  if (status === 404) return "원가 업로드는 아직 사용할 수 없습니다. 담당자에게 확인해 주세요.";
  if (status === 409) return "미리보기 내용이 달라졌습니다. 반영 전 최종 확인을 다시 진행해 주세요.";
  if (status === 400) return "파일과 열 연결을 확인한 뒤 미리보기를 다시 요청해 주세요.";
  return "처리 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도하면 중복 반영하지 않습니다.";
}

export function StoreCostUploadPanel({ companyId, storeAccountId, onSaved, onClose }: {
  companyId: string; storeAccountId: string; onSaved: (message: string) => void; onClose: () => void;
}) {
  const [sheet, setSheet] = useState<PurchaseSheet | null>(null);
  const [sourceRows, setSourceRows] = useState<SourceRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [server, setServer] = useState<ServerPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const importId = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);
  useUnsavedChangesWarning(Boolean(sheet));
  const headers = useMemo(() => sheet?.columns.map(column => `${column.letter} · ${column.header || "헤더 없음"}`) ?? [], [sheet]);
  const rawPreview = useMemo(() => sheet?.rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row.cells[index]]))) ?? [], [headers, sheet]);
  const preview = useMemo(() => {
    if (!sheet) return null;
    const mapping = Object.fromEntries(STORE_COST_IMPORT_FIELDS.filter(field => fieldMap[field.key])
      .map(field => [field.key, headers.indexOf(fieldMap[field.key])]));
    try { return { data: buildStoreCostImportPreview(sourceRows, mapping), error: "" }; }
    catch (error) { return { data: null, error: error instanceof Error ? error.message : "필수 열을 연결해 주세요." }; }
  }, [fieldMap, headers, sheet, sourceRows]);

  function invalidate() { setServer(null); setConfirmed(false); setError(""); importId.current = crypto.randomUUID(); }
  async function readFile(file: File | undefined) {
    if (!file || busy) return;
    invalidate(); setSheet(null); setSourceRows([]); setFileName(""); setFieldMap({}); setBusy(true);
    try {
      if (!/\.(xlsx?|csv)$/i.test(file.name) || file.size > 10 * 1024 * 1024 || file.name.length > 255) {
        throw new Error("10MB 이하의 xlsx·xls·csv 파일을 선택해 주세요. 파일명은 255자 이하여야 합니다.");
      }
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = file.name.toLowerCase().endsWith(".csv")
        ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""), { type: "string" })
        : XLSX.read(buffer, { type: "array", cellDates: false });
      const first = workbook.Sheets[workbook.SheetNames[0]];
      if (!first) throw new Error("파일에 시트가 없습니다. 첫 시트에 원가 자료를 넣어 다시 선택해 주세요.");
      // Keep Excel date serials numeric for the 04 parser; browser timezones must not shift the day.
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(first, { defval: "", header: 1, raw: true });
      const next = buildPurchaseSheet(matrix);
      if (!next.rows.length) throw new Error("파일에 원가 행이 없습니다. 자료를 넣어 다시 선택해 주세요.");
      if (next.rows.length > 2_000) throw new Error("한 번에 2,000행까지 확인할 수 있습니다. 파일을 나눠 다시 선택해 주세요.");
      const nextHeaders = next.columns.map(column => `${column.letter} · ${column.header || "헤더 없음"}`);
      const suggested = suggestStoreCostMapping(next.columns.map(column => column.header));
      setFieldMap(Object.fromEntries(Object.entries(suggested).map(([key, index]) => [key, nextHeaders[index!]])));
      setSheet(next); setSourceRows(next.rows.map(row => ({ rowNumber: row.rowNumber, cells: matrix[row.rowNumber - 1] })));
      setFileName(file.name);
    } catch (error) { setError(error instanceof Error ? error.message : "파일을 읽지 못했습니다. 다른 파일을 선택해 주세요."); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  async function requestPreview() {
    if (!preview?.data?.rows.length || preview.data.errors.length || busy) return;
    setBusy(true); setError(""); setServer(null); setConfirmed(false);
    try {
      const dto = buildStoreCostImportConfirmRequest({ companyId, storeAccountId, fileName, rows: preview.data.rows });
      const response = await fetch("/api/store/costs/import", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...dto, mode: "preview", importId: importId.current }) });
      if (!response.ok) throw new Error(importError(response.status));
      setServer(await response.json() as ServerPreview);
    } catch (error) { setError(error instanceof TypeError ? importError(503) : error instanceof Error ? error.message : importError(503)); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!server || !confirmed || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/store/costs/import", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, storeAccountId, fileName: server.fileName, rows: server.rows,
          importId: server.importId, confirmationHash: server.confirmationHash, mode: "apply" }) });
      if (!response.ok) {
        if (response.status < 500) { setServer(null); setConfirmed(false); }
        throw new Error(importError(response.status));
      }
      const result = await response.json() as { imported: number; replayed: number; total: number };
      onSaved(`원가 ${result.imported}행을 반영했습니다.${result.replayed ? ` 이미 반영된 ${result.replayed}행은 중복 저장하지 않았습니다.` : ""} 목록을 확인해 주세요.`);
    } catch (error) { setError(error instanceof TypeError ? importError(503) : error instanceof Error ? error.message : importError(503)); }
    finally { setBusy(false); }
  }
  const columns: CommonTableColumn<StoreCostInput>[] = [
    { key: "sourceRowNumber", label: "원본 행", value: row => row.sourceRowNumber },
    { key: "effectiveOn", label: "적용일", value: row => row.effectiveOn },
    { key: "productName", label: "품목", value: row => row.productName },
    { key: "specification", label: "규격", value: row => row.specification },
    { key: "unit", label: "단위", value: row => row.unit },
    { key: "costKrw", label: "원가 (원)", value: row => row.costKrw, align: "right" },
  ];
  return <section aria-label="엑셀 원가 업로드" className="space-y-4 rounded border p-4">
    <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">엑셀 원가 업로드</h4><Button className="min-h-[44px]" variant="outline" disabled={busy} onClick={onClose}>업로드 닫기</Button></div>
    <p className="text-sm">첫 시트를 읽습니다. 10MB·2,000행 이하 파일을 선택하고 필수 열과 오류를 확인해 주세요. 확인 후 반영을 눌러야 저장됩니다.</p>
    <label className="block text-sm">원가 파일 선택<input ref={fileInput} className="mt-1 block min-h-[44px] w-full" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={event => void readFile(event.target.files?.[0])} /></label>
    {fileName && <p className="break-all text-sm">선택한 파일: {fileName}</p>}
    {busy && <p role="status">원가 업로드 자료를 확인 중입니다.</p>}
    {error && <p role="alert">{error}</p>}
    {!sheet && !error && <p>선택한 파일이 없습니다. 원가 파일을 선택해 주세요.</p>}
    {sheet && <>
      <fieldset className="min-w-0" disabled={busy}><legend className="sr-only">원가 필수 열 맞추기</legend>
        <ExcelHeaderMappingPreview key={fileName} fields={fields} headers={headers} rows={rawPreview} fieldMap={fieldMap}
          onMap={next => { setFieldMap(next); invalidate(); }} />
      </fieldset>
      {preview?.error && <p role="alert">{preview.error}</p>}
      {preview?.data && <>
        <p aria-live="polite">반영 후보 {preview.data.rows.length}행 · 오류 {preview.data.errors.length}행 · 중복 {preview.data.duplicateCount}행</p>
        {preview.data.duplicateCount > 0 && <p>같은 일자·품목의 중복은 마지막 행으로 합쳤습니다. 원가와 원본 행을 확인해 주세요.</p>}
        {preview.data.errors.length > 0 && <div role="alert"><p>오류가 있는 행은 반영할 수 없습니다. 파일이나 열 연결을 수정해 주세요.</p><ul>{preview.data.errors.map(item => <li key={item.rowNumber}>{item.rowNumber}행: {item.message}</li>)}</ul></div>}
        <p className="text-sm">미리보기 내려받기에는 아래 반영 후보 행만 포함됩니다.</p>
        <CommonDataTable columns={columns} rows={server?.rows ?? preview.data.rows} rowKey={row => String(row.sourceRowNumber)} settingsKey="store-cost-upload-preview" filename="매장-원가-반영후보.csv" />
        <Button className="min-h-[44px]" disabled={busy || !preview.data.rows.length || preview.data.errors.length > 0} onClick={() => void requestPreview()}>반영 전 최종 확인</Button>
      </>}
      {server && <div className="space-y-3">
        <p>반영할 {server.rows.length}행을 확인했습니다. 원가와 중복 처리 내용을 확인한 뒤 반영해 주세요.</p>
        <label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />미리보기 원가와 중복 처리 내용을 확인했습니다.</label>
        <Button className="min-h-[44px]" disabled={busy || !confirmed} onClick={() => void apply()}>확인 후 반영</Button>
      </div>}
    </>}
  </section>;
}
