"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { ImportRowEditor } from "./import-row-editor";
import type { ImportPreviewRow } from "../domains/product/import-row-editor";
import { customerItemFileFields, prepareCustomerItemFile, type CustomerItemReferences } from "../application/customer/prepare-customer-item-file";

const aliases: Record<string,string[]> = {
  customerName: ["거래처명", "매출처명", "매장명"], productCode: ["ERP 상품코드", "상품코드", "ERP 코드", "품목코드"],
  salesUnit: ["판매 단위", "단위"], lastPrice: ["최근 실제 단가", "실제 단가", "최근단가", "단가"],
  lastDate: ["거래일", "일자", "날짜"], taxType: ["과세 구분", "과세"], priceIncludesTax: ["부가세 포함 여부", "부가세 포함"],
};

export function CustomerItemsImportDrawer({ companyId, onClose, onBack, onSaved }: {
  companyId: string; onClose: () => void; onBack: () => void; onSaved: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [refs, setRefs] = useState<CustomerItemReferences | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState<Record<string,string>[]>([]);
  const [mapping, setMapping] = useState<Record<string,string>>({});
  const [rows, setRows] = useState<ImportPreviewRow[]>([]);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/customers/items/import${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ""}`;
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setRefs(null); setError("");
    void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "거래처·상품 자료를 불러오지 못했습니다.");
      setRefs(payload);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "자료를 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [endpoint, reload]);
  const headers = raw[0] ? Object.keys(raw[0]) : [];
  const validation = useMemo(() => {
    if (!refs || !rows.length) return "";
    try { prepareCustomerItemFile(rows, refs); return ""; }
    catch (error) { return error instanceof Error ? error.message : "입력값을 확인해 주세요."; }
  }, [refs, rows]);

  async function read(file: File) {
    setBusy(true); setError("");
    try {
      if (file.size > 5_000_000) throw new Error("5MB 이하 파일을 선택해 주세요.");
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: true });
      const parsed = XLSX.utils.sheet_to_json<Record<string,string>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
      if (!parsed.length || parsed.length > 1000) throw new Error("첫 시트에 1~1,000행이 있는 파일을 선택해 주세요.");
      const names = Object.keys(parsed[0]);
      setMapping(Object.fromEntries(customerItemFileFields.map(field => [field.key, aliases[field.key].find(name => names.includes(name)) || ""])));
      setRaw(parsed); setFileName(file.name); setRows([]); setStep(2);
    } catch (error) { setError(error instanceof Error ? error.message : "파일을 읽지 못했습니다. 다시 선택해 주세요."); }
    finally { setBusy(false); }
  }
  function preview() {
    setRows(raw.map((row,index) => {
      const sheetRow = Reflect.get(row,"__rowNum__");
      const sourceRowNumber = typeof sheetRow === "number" ? sheetRow+1 : index+2;
      const values = Object.fromEntries(customerItemFileFields.map(field => [field.key, String(row[mapping[field.key]] ?? "")]));
      return { id: `customer-item-${sourceRowNumber}`, sourceRowNumber, originalValues: values, values: { ...values } };
    }));
    setError(""); setStep(3);
  }
  async function save() {
    if (busy || validation || !refs) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName, editedRows: rows }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "저장하지 못했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.");
      onSaved(result.replayed ? "이미 저장한 파일입니다. 중복으로 반영하지 않았습니다." : `거래처 품목 반영 ${result.applied}건 · 동일하거나 오래된 거래 ${result.skipped}건 건너뜀`);
    } catch (error) { setError(error instanceof Error ? error.message : "저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return (
    <dialog ref={dialog} aria-labelledby="customer-items-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-6xl border-0 bg-white p-0 text-slate-950 backdrop:bg-slate-950/45">
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-3 border-b px-4 py-5 sm:px-6">
          <div><h2 id="customer-items-title" className="text-xl font-bold">거래처별 품목 · 최근 단가 가져오기</h2>
            <p className="mt-2 text-sm text-slate-600">실제 거래 단가를 저장합니다. 기준 단가와 협의 고정가는 바뀌지 않습니다.</p></div>
          <button type="button" disabled={busy} aria-label="닫기" onClick={onClose} className="min-h-11 min-w-11 rounded-lg hover:bg-slate-100 focus-visible:outline focus-visible:outline-2"><X aria-hidden="true" className="mx-auto h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" aria-busy={busy}>
          <p className="text-sm font-semibold text-slate-600" aria-live="polite">{step} / 4 · {['파일 선택','열 맞추기','원본 확인 · 수정','최종 확인'][step-1]}</p>
          {fileName && step !== 4 ? <p className="break-all text-sm text-slate-600">{fileName}</p> : null}
          {!refs && !error ? <p role="status">거래처·상품 자료를 불러오는 중입니다.</p> : null}
          {!refs && error ? <button type="button" onClick={() => setReload(value => value+1)} className="maju-button-secondary">자료 다시 불러오기</button> : null}
          {step === 1 ? <label className="block space-y-3 text-sm font-semibold">
            <span>첫 시트의 거래처명 · ERP 상품코드 · 단위 · 실제 단가 · 거래일을 읽습니다.</span>
            <input aria-label="거래처 품목 파일" type="file" accept=".xls,.xlsx,.csv" disabled={!refs || busy} className="block w-full min-w-0 text-base file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-4 file:py-3 file:font-semibold file:text-teal-900" onChange={event => { const file=event.target.files?.[0]; if(file) void read(file); event.target.value=""; }} />
            <span className="block font-normal text-slate-600">최대 1,000행 · 5MB. 거래처명과 ERP 상품코드는 등록된 값과 정확히 같아야 합니다.</span>
          </label> : null}
          {step === 2 ? <div className="grid gap-4 sm:grid-cols-2">
            {customerItemFileFields.map((field,index) => <label key={field.key} className="block space-y-2 text-sm font-semibold">{field.label}{index<5 ? " *" : ""}
              <select className="maju-input block w-full text-base" value={mapping[field.key] || ""} onChange={event => setMapping(current => ({...current,[field.key]:event.target.value}))}>
                <option value="">{index<5 ? "열 선택" : "미확인으로 가져오기"}</option>{headers.map(header => <option key={header}>{header}</option>)}
              </select></label>)}
            <p className="text-sm leading-6 text-slate-600 sm:col-span-2">거래일: YYYY-MM-DD · 과세: 과세/면세/미확인 · 부가세: 포함/별도. 과세를 모르면 부가세 포함 여부는 비워 둡니다.</p>
          </div> : null}
          {step === 3 ? <div className="[&_input]:min-w-0 [&_table]:min-w-0 [&_table]:table-fixed [&_th]:min-w-0 [&_th:first-child]:whitespace-nowrap"><ImportRowEditor key={fileName} fields={customerItemFileFields} initialRows={rows} onRowsChange={setRows} /></div> : null}
          {step === 4 ? <section className="space-y-3 text-sm leading-6"><h3 className="break-all text-lg font-semibold">{fileName}</h3><p>{rows.length}행의 거래처 품목을 확인했습니다. 원본 값과 수정 값은 가져오기 이력에 함께 저장됩니다.</p><p>더 최근 거래만 반영하며 동일한 날짜의 단가가 다르면 전체 저장을 중단합니다. 같은 파일을 다시 저장해도 중복 반영하지 않습니다.</p></section> : null}
          {validation && step >= 3 ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{validation}</p> : null}
          {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error}</p> : null}
        </div>
        <footer className="flex flex-wrap justify-between gap-3 border-t p-4 sm:px-6">
          <button type="button" disabled={busy} className="maju-button-secondary" onClick={() => step===1 ? onBack() : setStep(value => value-1)}>{step===1 ? "대상 다시 선택" : "이전"}</button>
          {step===2 ? <button type="button" disabled={busy || customerItemFileFields.slice(0,5).some(field=>!mapping[field.key])} className="maju-button-primary" onClick={preview}>원본 확인 · 수정</button> : null}
          {step===3 ? <button type="button" disabled={busy || Boolean(validation)} className="maju-button-primary" onClick={()=>setStep(4)}>최종 확인</button> : null}
          {step===4 ? <button type="button" disabled={busy || Boolean(validation)} className="maju-button-primary" onClick={()=>void save()}>{busy ? "저장 중…" : "확인 후 저장"}</button> : null}
        </footer>
      </div>
    </dialog>
  );
}
