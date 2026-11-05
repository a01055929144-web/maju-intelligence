"use client";

import { RegionPicker } from "@/components/region-picker";
import { formatPhoneNumber } from "@/lib/phone";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, MapPin, Plus, Trash2 } from "lucide-react";
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
  suggestedMainPhone?: string;
  values: CompanyProfileValues;
};

type Contact = { name: string; phone: string; hours: string };
type AddressResult = { address: string; jibunAddress?: string; latitude?: number; longitude?: number; postalCode?: string };
type CompanyBasics = { name: string; originAddress: string; originLat?: number; originLng?: number };

async function searchKakaoAddress(query: string): Promise<{ message?: string; results: AddressResult[] }> {
  if (query.trim().length < 2) return { message: "주소를 2글자 이상 입력하세요.", results: [] };
  const response = await fetch(`/api/address-search?query=${encodeURIComponent(query.trim())}`, { cache: "no-store" }).catch(() => null);
  const payload = response ? ((await response.json().catch(() => null)) as { message?: string; results?: AddressResult[] } | null) : null;
  if (!response?.ok) return { message: payload?.message || "주소 검색에 실패했습니다.", results: [] };
  const results = payload?.results || [];
  return { message: results.length ? "" : "검색 결과가 없습니다.", results };
}

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
  // 11/3: 회사명·출발지(companies)도 이 화면에서 함께 저장합니다(중복 카드 제거). 관리자 화면은 고객사 관리에서.
  const [basics, setBasics] = useState<CompanyBasics | null>(null);
  const savedSnapshot = useRef("");
  const snapshot = useCallback((nextValues: CompanyProfileValues, nextBasics: CompanyBasics | null) => JSON.stringify([nextValues, nextBasics]), []);
  const dirty = Boolean(data) && savedSnapshot.current !== snapshot(values, basics);

  useEffect(() => {
    if (companyId) return;
    void fetch("/api/customer/settings", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { company?: CompanyBasics } | null) => {
        if (!payload?.company) return;
        const next = { name: payload.company.name || "", originAddress: payload.company.originAddress || "", originLat: payload.company.originLat, originLng: payload.company.originLng };
        setBasics(next);
        setValues((currentValues) => { savedSnapshot.current = snapshot(currentValues, next); return currentValues; });
      })
      .catch(() => null);
  }, [companyId, snapshot]);

  // 저장하지 않고 떠나면 알립니다(새로고침·닫기·다른 메뉴 클릭).
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.href.startsWith("javascript:")) return;
      if (!window.confirm("저장하지 않은 내용이 있습니다. 저장하지 않고 이동할까요?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", onClick, true); };
  }, [dirty]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/company-profile${query}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as ProfilePayload | null;
        if (!active) return;
        if (!response.ok || !payload) { setNotice({ tone: "error", text: payload?.message || "회사 정보를 불러오지 못했습니다." }); return; }
        setData(payload);
        const loaded = payload.values || {};
        setBasics((currentBasics) => { savedSnapshot.current = snapshot(loaded, currentBasics); return currentBasics; });
        // 대표 휴대폰이 비어 있으면 카카오 가입 휴대폰 번호로 먼저 채웁니다(저장은 대표가 확인 후).
        setValues(!loaded.main_phone && payload.suggestedMainPhone ? { ...loaded, main_phone: payload.suggestedMainPhone } : loaded);
      })
      .catch(() => { if (active) setNotice({ tone: "error", text: "네트워크 연결을 확인해 주세요." }); });
    return () => { active = false; };
  }, [query, snapshot]);

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
      if (basics && savedSnapshot.current !== snapshot(values, basics)) {
        const original = JSON.parse(savedSnapshot.current || "[null,null]")[1] as CompanyBasics | null;
        if (!original || original.name !== basics.name || original.originAddress !== basics.originAddress) {
          if (!basics.name.trim()) throw new Error("회사명을 입력해 주세요.");
          if (basics.originAddress.trim() && (!Number.isFinite(basics.originLat) || !Number.isFinite(basics.originLng))) throw new Error("출발지는 주소 검색 결과에서 골라 주세요.");
          const settings = await fetch("/api/customer/settings", { cache: "no-store" }).then((response) => response.json()).catch(() => null) as { company?: Record<string, unknown> } | null;
          const companyResponse = await fetch("/api/customer/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...(settings?.company || {}), name: basics.name.trim(), originAddress: basics.originAddress, originLat: basics.originLat, originLng: basics.originLng, section: "company" })
          });
          if (!companyResponse.ok) {
            const message = ((await companyResponse.json().catch(() => null)) as { error?: string } | null)?.error;
            throw new Error(message || "회사명·출발지를 저장하지 못했습니다.");
          }
        }
      }
      const response = await fetch("/api/company-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, values })
      });
      const payload = (await response.json().catch(() => null)) as ProfilePayload | null;
      if (!response.ok || !payload) throw new Error(payload?.message || "저장하지 못했습니다.");
      setData(payload);
      setValues(payload.values || {});
      savedSnapshot.current = snapshot(payload.values || {}, basics);
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
          <div className="flex items-center gap-2">
            {dirty ? <span className="text-[11px] font-bold text-amber-700">저장 안 됨</span> : null}
            <button className="maju-button-primary h-9 px-4 text-xs" disabled={saving} onClick={() => void save()} type="button">{saving ? "저장 중" : "저장"}</button>
          </div>
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
        <div className="grid min-w-0 gap-3 p-4 md:grid-cols-2 [&>*]:min-w-0">
          {current.description ? <p className="text-xs font-semibold text-slate-500 md:col-span-2">{current.description}</p> : null}
          {current.id === "basic" ? <div><p className="text-[11px] font-black text-slate-600">사업자등록번호</p><p className="maju-input mt-1 flex items-center" aria-label="사업자등록번호">{data.company.businessRegistrationNumber || "미등록"}</p></div> : null}
          {current.id === "basic" && basics ? (
            <CompanyBasicsFields basics={basics} onChange={setBasics} readOnly={!editable} />
          ) : null}
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
                onChangeExtra={setValue}
                postcode={String(values.business_postcode || "")}
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

function AddressSearchInput({ onPick, placeholder, readOnly, value }: { onPick: (result: AddressResult | null, text: string) => void; placeholder?: string; readOnly: boolean; value: string }) {
  const [results, setResults] = useState<AddressResult[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const found = await searchKakaoAddress(value);
    setBusy(false);
    setResults(found.results);
    setMessage(found.message || "");
  }
  return (
    <div>
      <div className="mt-1 flex gap-1.5">
        <input className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-xs font-semibold disabled:bg-slate-50" disabled={readOnly} onChange={(event) => { onPick(null, event.target.value); setResults([]); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void run(); } }} placeholder={placeholder} value={value} />
        {!readOnly ? <button className="maju-button-secondary h-9 shrink-0 px-3 text-xs" disabled={busy} onClick={() => void run()} type="button"><MapPin className="h-3.5 w-3.5" />{busy ? "검색 중" : "주소 검색"}</button> : null}
      </div>
      {message ? <p className="mt-1 text-[11px] font-semibold text-slate-500">{message}</p> : null}
      {results.length ? (
        <div className="mt-1 divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200">
          {results.map((result, index) => (
            <button className="block w-full px-3 py-2 text-left text-xs hover:bg-teal-50" key={`${result.address}-${index}`} onClick={() => { onPick(result, result.address); setResults([]); setMessage("선택했습니다. 저장을 눌러 주세요."); }} type="button">
              <span className="font-bold text-slate-900">{result.address}</span>
              {result.postalCode ? <span className="ml-1 text-slate-500">({result.postalCode})</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompanyBasicsFields({ basics, onChange, readOnly }: { basics: CompanyBasics; onChange: (next: CompanyBasics) => void; readOnly: boolean }) {
  return (
    <>
      <div>
        <p className="text-[11px] font-black text-slate-600">회사명<span className="text-rose-600">*</span></p>
        <input className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-xs font-semibold disabled:bg-slate-50" disabled={readOnly} onChange={(event) => onChange({ ...basics, name: event.target.value })} value={basics.name} />
      </div>
      <div>
        <p className="text-[11px] font-black text-slate-600">출발지(창고) 주소</p>
        <AddressSearchInput
          onPick={(result, text) => onChange(result ? { ...basics, originAddress: result.address, originLat: result.latitude, originLng: result.longitude } : { ...basics, originAddress: text, originLat: undefined, originLng: undefined })}
          placeholder="도로명 주소로 검색"
          readOnly={readOnly}
          value={basics.originAddress}
        />
        <p className="mt-1 text-[11px] font-medium text-slate-500">지도·배송 코스의 출발점입니다.</p>
      </div>
    </>
  );
}

function FieldInput({
  canEditLocked, field, fileUrl, onChange, onChangeExtra, onUpload, postcode, readOnly, uploading, value
}: {
  canEditLocked: boolean;
  onChangeExtra: (key: string, value: unknown) => void;
  postcode: string;
  field: CompanyProfileField;
  fileUrl?: string;
  onChange: (value: unknown) => void;
  onUpload: (file: File) => void;
  readOnly: boolean;
  uploading: boolean;
  value: unknown;
}) {
  const wide = ["textarea", "contacts", "checks", "checksOther", "tags"].includes(field.type);
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
    case "mobile":
      control = <input className={inputClass} disabled={readOnly} inputMode="tel" onChange={(event) => onChange(formatPhoneNumber(event.target.value))} placeholder="010-0000-0000" value={formatPhoneNumber(String(value ?? ""))} />;
      break;
    case "address":
      control = (
        <>
          <AddressSearchInput
            onPick={(result, text) => { onChange(result ? result.address : text); if (result) onChangeExtra("business_postcode", result.postalCode || ""); }}
            placeholder="도로명 주소로 검색"
            readOnly={readOnly}
            value={String(value ?? "")}
          />
          {postcode ? <p className="mt-1 text-[11px] font-semibold text-slate-500">우편번호 {postcode}</p> : null}
        </>
      );
      break;
    case "checksOther": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const options = (field.options || []) as readonly string[];
      const others = selected.filter((item) => !options.includes(item));
      control = (
        <div className="mt-1 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {options.map((option) => (
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
          <input
            className={inputClass}
            disabled={readOnly}
            onChange={(event) => onChange([...selected.filter((item) => options.includes(item)), ...event.target.value.split(",").map((item) => item.trimStart())])}
            placeholder="기타 (쉼표로 구분해 직접 입력)"
            value={others.join(", ")}
          />
        </div>
      );
      break;
    }
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
      // 11/4: 배송 지역은 글자로 입력하지 않고 지도·시군구 목록에서 고릅니다(영업 정보와 같은 방식).
      if (field.key === "delivery_regions") {
        const regions = Array.isArray(value) ? (value as string[]).map((item) => item.trim()).filter(Boolean) : [];
        control = <div className="mt-1"><RegionPicker disabled={readOnly} onChange={(next) => onChange(next)} title="배송 지역" value={regions} /></div>;
        break;
      }
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
