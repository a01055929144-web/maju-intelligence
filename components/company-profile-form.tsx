"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Lock, Plus, Trash2 } from "lucide-react";
import {
  type CompanyProfileField,
  type CompanyProfileSection,
  type CompanyProfileValues,
  WEEKDAY_LABELS,
  companyProfileProgress,
  visibleCompanyProfileSections
} from "@/domains/organization/company-profile";

type ProfilePayload = {
  available: boolean;
  canEdit: boolean;
  canEditLocked?: boolean;
  company: { name: string; businessRegistrationNumber: string; originAddress: string };
  fileUrls: Record<string, string>;
  isAdmin: boolean;
  message?: string;
  regionSync?: { added: string[]; skipped: string[] };
  values: CompanyProfileValues;
};

type Contact = { name: string; phone: string; hours: string };

/** 회사 정보 통합 화면. 운영(설정 > 회사 정보)과 관리자(고객사 관리)가 같은 화면을 씁니다. */
export function CompanyProfileForm({ companyId, initialTab = "basic", orderContent, slots }: {
  companyId?: string;
  initialTab?: string;
  /** '주문' 탭 내용(주문 마감·최소 금액 등). 11/3: 주문 설정을 회사 정보 안으로. */
  orderContent?: ReactNode;
  /** 탭 아래에 붙일 기존 설정 카드(기본: 회사명·출발지, 배송: 배송 알림 문구·영업 지역). */
  slots?: Partial<Record<string, ReactNode>>;
}) {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [values, setValues] = useState<CompanyProfileValues>({});
  const [tab, setTab] = useState(initialTab);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/company-profile${query}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as ProfilePayload | null;
        if (!active) return;
        if (!response.ok || !payload) { setNotice({ tone: "error", text: payload?.message || "회사 정보를 불러오지 못했습니다." }); return; }
        setData(payload);
        setValues(payload.values || {});
      })
      .catch(() => { if (active) setNotice({ tone: "error", text: "네트워크 연결을 확인해 주세요." }); });
    return () => { active = false; };
  }, [query]);

  const isAdmin = Boolean(data?.isAdmin);
  const sections = useMemo(() => {
    const list = visibleCompanyProfileSections(isAdmin);
    // 11/3 탭 순서: 기본(서류 포함) > 품목 > 주문 > 배송 > 결제 > 상담
    const at = list.findIndex((section) => section.id === "products");
    const order: CompanyProfileSection = { description: "주문 링크에 그대로 안내됩니다.", fields: [], id: "order", title: "주문" };
    return [...list.slice(0, at + 1), order, ...list.slice(at + 1)];
  }, [isAdmin]);
  const progress = companyProfileProgress(values);
  const current = sections.find((section) => section.id === tab) || sections[0];

  function setValue(key: string, value: unknown) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/company-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, values })
      });
      const payload = (await response.json().catch(() => null)) as ProfilePayload | null;
      if (!response.ok || !payload) throw new Error(payload?.message || "저장하지 못했습니다.");
      setData(payload);
      setValues(payload.values || {});
      const added = payload.regionSync?.added || [];
      const skipped = payload.regionSync?.skipped || [];
      setNotice({
        tone: skipped.length ? "error" : "ok",
        text: [
          "회사 정보를 저장했습니다.",
          added.length ? `영업 지역에 ${added.join(", ")}을(를) 추가했습니다.` : "",
          skipped.length ? `지역 형식을 확인해 주세요: ${skipped.join(", ")} (예: 서울 강남구)` : ""
        ].filter(Boolean).join(" ")
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "저장하지 못했습니다." });
    } finally {
      setSaving(false);
    }
  }

  async function upload(field: CompanyProfileField, file: File) {
    setUploading(field.key);
    setNotice(null);
    const form = new FormData();
    form.set("file", file);
    form.set("fieldKey", field.key);
    if (companyId) form.set("companyId", companyId);
    try {
      const response = await fetch("/api/company-profile/file", { method: "POST", body: form });
      const payload = (await response.json().catch(() => null)) as { message?: string; url?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "업로드하지 못했습니다.");
      setValue(field.key, isAdmin ? "uploaded" : "submitted");
      setData((previous) => previous ? { ...previous, fileUrls: { ...previous.fileUrls, [field.key]: payload?.url || "" } } : previous);
      setNotice({ tone: "ok", text: `${field.label}을(를) 올렸습니다.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "업로드하지 못했습니다." });
    } finally {
      setUploading("");
    }
  }

  if (!data) {
    return <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{notice?.text || "회사 정보를 불러오는 중입니다."}</section>;
  }

  const editable = data.canEdit;

  return (
    <section className="rounded-xl border border-slate-200 bg-white" id="company-profile">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-base font-black text-slate-950">회사 정보</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {data.company.name || "회사명 미등록"} · 사업자 {data.company.businessRegistrationNumber || "미등록"}
            {!data.canEditLocked ? <span className="ml-1 inline-flex items-center gap-0.5 text-slate-400"><Lock className="h-3 w-3" />잠금 항목은 대표만 바꿀 수 있습니다</span> : null}
          </p>
        </div>
        <div className="w-44">
          <p className="text-[11px] font-bold text-slate-600">입력 {progress.filled}/{progress.total} · 채울수록 리드가 정확해집니다</p>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-teal-600" style={{ width: `${Math.round((progress.filled / progress.total) * 100)}%` }} /></div>
        </div>
        {editable ? (
          <button className="maju-button-primary h-9 px-4 text-xs" disabled={saving} onClick={() => void save()} type="button">{saving ? "저장 중" : "저장"}</button>
        ) : null}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2" role="tablist">
        {sections.map((section) => (
          <button
            aria-selected={section.id === current?.id}
            className={`h-9 shrink-0 rounded-t-md px-3 text-xs font-black ${section.id === current?.id ? "border-b-2 border-teal-700 text-teal-800" : "text-slate-500 hover:text-slate-800"}`}
            key={section.id}
            onClick={() => setTab(section.id)}
            role="tab"
            type="button"
          >
            {section.title}
          </button>
        ))}
      </div>

      {notice ? <p className={`mx-4 mt-3 rounded-md px-3 py-2 text-xs font-bold ${notice.tone === "ok" ? "bg-teal-50 text-teal-800" : "bg-rose-50 text-rose-700"}`} role="status">{notice.text}</p> : null}

      {current ? (
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {current.description ? <p className="text-xs font-semibold text-slate-500 md:col-span-2">{current.description}</p> : null}
          {current.id === "order" ? (
            <div className="md:col-span-2">{orderContent || <p className="rounded-md bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-600">주문 링크를 켜면 주문 마감·배송일·최소 주문 금액을 여기서 정합니다.</p>}</div>
          ) : null}
          {current.fields.map((field) => {
            const readOnly = !editable || (Boolean(field.locked) && !data.canEditLocked);
            return (
              <FieldInput
                canEditLocked={Boolean(data.canEditLocked)}
                field={field}
                fileUrl={data.fileUrls[field.key]}
                key={field.key}
                onChange={(value) => setValue(field.key, value)}
                onUpload={(file) => void upload(field, file)}
                readOnly={readOnly}
                uploading={uploading === field.key}
                value={values[field.key]}
              />
            );
          })}
        </div>
      ) : null}
      {current && slots?.[current.id] ? <div className="space-y-4 border-t border-slate-100 p-4">{slots[current.id]}</div> : null}
    </section>
  );
}

function FieldInput({
  canEditLocked, field, fileUrl, onChange, onUpload, readOnly, uploading, value
}: {
  canEditLocked: boolean;
  field: CompanyProfileField;
  fileUrl?: string;
  onChange: (value: unknown) => void;
  onUpload: (file: File) => void;
  readOnly: boolean;
  uploading: boolean;
  value: unknown;
}) {
  const wide = ["textarea", "contacts", "checks", "tags"].includes(field.type);
  const inputClass = "mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-xs font-semibold disabled:bg-slate-50 disabled:text-slate-600";
  const label = (
    <p className="flex items-center gap-1 text-[11px] font-black text-slate-600">
      {field.label}
      {field.required ? <span className="text-rose-600">*</span> : null}
      {readOnly && field.locked && !canEditLocked ? <Lock aria-label="대표만 변경" className="h-3 w-3 text-slate-400" /> : null}
    </p>
  );
  const hint = field.hint ? <p className="mt-1 text-[11px] font-medium text-slate-500">{field.hint}</p> : null;

  let control: ReactNode = null;
  switch (field.type) {
    case "textarea":
      control = <textarea className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs font-semibold leading-5 disabled:bg-slate-50" disabled={readOnly} onChange={(event) => onChange(event.target.value)} rows={3} value={String(value ?? "")} />;
      break;
    case "date":
    case "time":
      control = <input className={inputClass} disabled={readOnly} onChange={(event) => onChange(event.target.value)} type={field.type} value={String(value ?? "").slice(0, field.type === "time" ? 5 : 10)} />;
      break;
    case "number":
      control = <input className={inputClass} disabled={readOnly} inputMode="numeric" onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))} value={value === null || value === undefined ? "" : String(value)} />;
      break;
    case "select":
      control = (
        <select className={inputClass} disabled={readOnly} onChange={(event) => onChange(event.target.value)} value={String(value ?? "")}>
          {(field.options || []).map((option) => <option key={option} value={option}>{option || "선택 안 함"}</option>)}
        </select>
      );
      break;
    case "boolean":
      control = (
        <div className="mt-1 flex gap-1.5">
          {[true, false].map((option) => (
            <button
              className={`h-8 rounded-md border px-3 text-xs font-bold ${Boolean(value) === option ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}
              disabled={readOnly}
              key={String(option)}
              onClick={() => onChange(option)}
              type="button"
            >
              {option ? "가능" : "불가"}
            </button>
          ))}
        </div>
      );
      break;
    case "weekdays": {
      const days = Array.isArray(value) ? (value as number[]) : [];
      control = (
        <div className="mt-1 flex flex-wrap gap-1">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <button
              aria-pressed={days.includes(day)}
              className={`h-8 w-9 rounded-md border text-xs font-bold ${days.includes(day) ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 text-slate-600"}`}
              disabled={readOnly}
              key={day}
              onClick={() => onChange(days.includes(day) ? days.filter((item) => item !== day) : [...days, day])}
              type="button"
            >
              {WEEKDAY_LABELS[day]}
            </button>
          ))}
        </div>
      );
      break;
    }
    case "checks": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      control = (
        <div className="mt-1 flex flex-wrap gap-1">
          {(field.options || []).map((option) => (
            <button
              aria-pressed={selected.includes(option)}
              className={`h-8 rounded-full border px-3 text-xs font-bold ${selected.includes(option) ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}
              disabled={readOnly}
              key={option}
              onClick={() => onChange(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option])}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      );
      break;
    }
    case "tags": {
      const text = Array.isArray(value) ? (value as string[]).join(", ") : String(value ?? "");
      control = <input className={inputClass} disabled={readOnly} onChange={(event) => onChange(event.target.value.split(",").map((item) => item.trimStart()))} placeholder={field.placeholder} value={text} />;
      break;
    }
    case "contacts": {
      const rows = Array.isArray(value) ? (value as Contact[]) : [];
      const update = (index: number, patch: Partial<Contact>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
      control = (
        <div className="mt-1 space-y-1.5">
          {rows.map((row, index) => (
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5" key={index}>
              <input className="h-9 rounded-md border border-slate-200 px-2 text-xs" disabled={readOnly} onChange={(event) => update(index, { name: event.target.value })} placeholder="이름" value={row.name || ""} />
              <input className="h-9 rounded-md border border-slate-200 px-2 text-xs" disabled={readOnly} onChange={(event) => update(index, { phone: event.target.value })} placeholder="연락처" value={row.phone || ""} />
              <input className="h-9 rounded-md border border-slate-200 px-2 text-xs" disabled={readOnly} onChange={(event) => update(index, { hours: event.target.value })} placeholder="상담 시간" value={row.hours || ""} />
              <button aria-label="담당자 삭제" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500" disabled={readOnly} onClick={() => onChange(rows.filter((_, i) => i !== index))} type="button"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {!readOnly && rows.length < 5 ? (
            <button className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed border-slate-300 px-3 text-xs font-bold text-slate-600" onClick={() => onChange([...rows, { hours: "", name: "", phone: "" }])} type="button"><Plus className="h-3.5 w-3.5" />담당자 추가</button>
          ) : null}
        </div>
      );
      break;
    }
    case "file": {
      const has = Boolean(value);
      control = (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className={`font-bold ${has ? "text-teal-700" : "text-slate-500"}`}>{has ? "제출 완료" : "미제출"}</span>
          {fileUrl ? <a className="font-bold text-teal-700 underline" href={fileUrl} rel="noreferrer" target="_blank">보기</a> : null}
          {!readOnly ? (
            <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-slate-200 px-3 font-bold text-slate-700">
              {uploading ? "올리는 중" : has ? "교체" : "올리기"}
              <input accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} type="file" />
            </label>
          ) : null}
        </div>
      );
      break;
    }
    default:
      control = <input className={inputClass} disabled={readOnly} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} value={String(value ?? "")} />;
  }

  return (
    <div className={wide ? "md:col-span-2" : ""}>
      {label}
      {control}
      {hint}
    </div>
  );
}
