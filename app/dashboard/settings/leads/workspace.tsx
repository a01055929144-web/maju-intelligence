"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, ListFilter, Smartphone, Store, TableProperties } from "lucide-react";

type FieldType = "text" | "number" | "date" | "select" | "multi_select" | "checkbox";
type LeadField = { id: string; key: string; label: string; fieldType: FieldType; options: Array<{ id: string; label: string; order: number }>; showInList: boolean; filterable: boolean };
type ParsedSheet = { name: string; rows: unknown[][] };

const FIELD_TYPES: Array<[FieldType, string]> = [["text", "글자"], ["number", "숫자"], ["date", "날짜"], ["select", "하나 선택"], ["multi_select", "여러 개 선택"], ["checkbox", "체크"]];
const COMMON_HEADERS: Record<string, string> = { 상호: "businessName", 상호명: "businessName", 업체명: "businessName", 주소: "address", 전화: "phone", 전화번호: "phone", 휴대폰: "phone", 이메일: "email", 팩스: "fax", 상태: "status", 단계: "status", 메모: "memo" };

export function LeadWorkspaceSettings({ companyId, initialTab = "fields" }: { companyId?: string; initialTab?: "fields" | "import" | "distributors" } = {}) {
  const [tab, setTab] = useState<"fields" | "import" | "distributors">(initialTab);
  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 p-2">
      <Tab active={tab === "fields"} icon={<TableProperties className="h-4 w-4" />} label="리드 칸" onClick={() => setTab("fields")} />
      <Tab active={tab === "import"} icon={<FileSpreadsheet className="h-4 w-4" />} label="엑셀 가져오기" onClick={() => setTab("import")} />
      <Tab active={tab === "distributors"} icon={<Store className="h-4 w-4" />} label="유통사" onClick={() => setTab("distributors")} />
    </div>
    <div className="p-4 sm:p-5">{tab === "fields" ? <LeadFieldsPanel companyId={companyId} /> : tab === "import" ? <LeadImportPanel /> : <DistributorPanel />}</div>
  </section>;
}

function Tab({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold ${active ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`} onClick={onClick} type="button">{icon}{label}</button>;
}

function LeadFieldsPanel({ companyId }: { companyId?: string }) {
  const [fields, setFields] = useState<LeadField[]>([]);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [showInList, setShowInList] = useState(true);
  const [filterable, setFilterable] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    void fetch(`/api/leads/fields${query}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "리드 칸을 불러오지 못했습니다.");
        if (active) setFields(Array.isArray(payload?.fields) ? payload.fields : []);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "리드 칸을 불러오지 못했습니다.");
      });
    return () => { active = false; };
  }, [companyId]);
  async function addField() {
    if (!label.trim()) return setMessage("칸 이름을 입력해 주세요.");
    const response = await fetch("/api/leads/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, label: label.trim(), fieldType, showInList, filterable }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return setMessage(payload?.message || "칸을 저장하지 못했습니다.");
    setFields((current) => [...current, payload.field]); setLabel(""); setMessage("리드 칸을 저장했습니다.");
  }
  const preview = fields.at(-1) || (label.trim() ? { id: "preview", key: "preview", label: label.trim(), fieldType, options: [], showInList, filterable } satisfies LeadField : null);
  return <div className="space-y-5">
    <div><h2 className="text-lg font-black text-slate-950">회사에서 쓸 리드 칸</h2><p className="mt-1 text-sm text-slate-600">칸을 숨겨도 기존 값은 보관됩니다. SQL 적용 전에는 이 화면 자체가 노출되지 않습니다.</p></div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="block text-sm font-bold text-slate-700">칸 이름<input className="maju-input mt-1 w-full" maxLength={60} onChange={(event) => setLabel(event.target.value)} placeholder="예: 월 예상 사용량" value={label} /></label>
        <label className="block text-sm font-bold text-slate-700">형식<select className="maju-input mt-1 w-full" onChange={(event) => setFieldType(event.target.value as FieldType)} value={fieldType}>{FIELD_TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input checked={showInList} onChange={(event) => setShowInList(event.target.checked)} type="checkbox" />목록에 표시</label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input checked={filterable} onChange={(event) => setFilterable(event.target.checked)} type="checkbox" />필터로 사용</label>
        <button className="maju-button-primary w-full justify-center" onClick={() => void addField()} type="button">칸 추가</button>{message ? <p className="text-xs font-bold text-slate-600">{message}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><Preview title="목록 칸" icon={<TableProperties className="h-4 w-4" />} text={preview?.showInList ? `${preview.label}  -` : "목록 표시를 켜면 보입니다."} /><Preview title="필터" icon={<ListFilter className="h-4 w-4" />} text={preview?.filterable ? `${preview.label} 전체` : "필터 사용을 켜면 보입니다."} /><Preview title="상세 입력" icon={<Store className="h-4 w-4" />} text={preview ? `${preview.label} 입력` : "칸 이름을 입력해 미리 보세요."} /><Preview title="휴대폰 카드" icon={<Smartphone className="h-4 w-4" />} text={preview ? `${preview.label}: -` : "저장된 칸이 카드에 표시됩니다."} /></div>
    </div>
  </div>;
}

function Preview({ icon, text, title }: { icon: React.ReactNode; text: string; title: string }) { return <div className="rounded-xl border border-slate-200 p-4"><p className="flex items-center gap-2 text-xs font-black text-teal-700">{icon}{title}</p><p className="mt-3 text-sm font-semibold text-slate-700">{text}</p></div>; }

function LeadImportPanel() {
  const [sheets, setSheets] = useState<ParsedSheet[]>([]); const [sheetIndex, setSheetIndex] = useState(0); const [error, setError] = useState("");
  const sheet = sheets[sheetIndex];
  const headerIndex = useMemo(() => detectHeaderRow(sheet?.rows || []), [sheet]);
  const headers = (sheet?.rows[headerIndex] || []).map(String);
  async function readFile(file?: File) {
    if (!file) return; setError("");
    try { const XLSX = await import("xlsx"); const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" }); setSheets(workbook.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" }) as unknown[][] }))); setSheetIndex(0); }
    catch { setError("파일을 읽지 못했습니다. .xls, .xlsx 또는 .csv 파일인지 확인해 주세요."); }
  }
  return <div className="space-y-4"><div><h2 className="text-lg font-black">리드 엑셀 가져오기</h2><p className="mt-1 text-sm text-slate-600">시트와 칸 이름 줄을 확인한 뒤 500행 단위로 저장합니다. 현재는 SQL 승인 전 미리보기 단계입니다.</p></div><label className="flex min-h-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-700"><input accept=".xls,.xlsx,.csv" className="sr-only" onChange={(event) => void readFile(event.target.files?.[0])} type="file" />.xls · .xlsx · .csv 선택</label>{error ? <p className="text-sm font-bold text-rose-600">{error}</p> : null}{sheets.length ? <><select className="maju-input" onChange={(event) => setSheetIndex(Number(event.target.value))} value={sheetIndex}>{sheets.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select><p className="text-xs font-bold text-slate-500">감지된 칸 이름 줄: {headerIndex + 1}행 · 데이터 {(sheet.rows.length - headerIndex - 1).toLocaleString()}행</p><div className="overflow-x-auto"><table className="min-w-[720px] text-sm"><thead><tr>{headers.map((header, index) => <th className="border bg-slate-50 p-2 text-left" key={`${header}-${index}`}>{header || `빈 칸 ${index + 1}`}<span className="mt-1 block text-[11px] text-teal-700">{COMMON_HEADERS[header.replace(/\s/g, "")] || "우리 회사 칸 만들기"}</span></th>)}</tr></thead><tbody>{sheet.rows.slice(headerIndex + 1, headerIndex + 4).map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, columnIndex) => <td className="border p-2" key={columnIndex}>{String(row[columnIndex] ?? "")}</td>)}</tr>)}</tbody></table></div></> : null}</div>;
}

function detectHeaderRow(rows: unknown[][]) { let best = 0; let score = -1; rows.slice(0, 20).forEach((row, index) => { const next = row.filter((value) => String(value ?? "").trim()).length; if (next > score) { best = index; score = next; } }); return best; }
function DistributorPanel() { return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="text-lg font-black text-amber-950">유통사 대상</h2><p className="mt-2 text-sm leading-6 text-amber-900">본사 전용 유통사 목록은 `target_type=distributor`로 분리됩니다. SQL 적용과 대표 구글시트 드라이런 승인 후 목록·등급·ERP·취급 품목·매장 수·매칭 상태·중개 상태를 연결합니다.</p></div>; }
