"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  FileVideo,
  ImageIcon,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Save,
  Search,
  Store
} from "lucide-react";
import { formatUploadSizeMb, MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload-limits";

type ExternalBusinessResult = {
  address: string;
  industry: string;
  kakaoPlaceUrl: string;
  name: string;
  phone: string;
  roadAddress: string;
};

type Draft = {
  customerName: string;
  address: string;
  phone: string;
  industry: string;
  kakaoPlaceUrl: string;
};

type CreatedCustomer = { id: string; customerName: string };

type AttachmentItem = {
  id: string;
  attachmentType: string;
  createdAt: string;
  fileUrl: string;
  mimeType: string;
  title: string;
};

const emptyDraft: Draft = { customerName: "", address: "", phone: "", industry: "", kakaoPlaceUrl: "" };

const attachmentSlots = [
  { accept: "image/*,.pdf", description: "사업자 정보 원본 사진", key: "business_license", label: "사업자등록증" },
  { accept: "image/*,.pdf", description: "필요 시 마스킹 후 보관", key: "identity_document", label: "신분증" },
  { accept: "image/*,video/*", description: "후문·냉장고 등 적재 위치", key: "loading_position", label: "적재위치" }
];

export function MobileRegisterWorkspace() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalBusinessResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [createdCustomer, setCreatedCustomer] = useState<CreatedCustomer | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearchMessage("");
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/business-search?query=${encodeURIComponent(query.trim())}`, { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      const payload = (await response?.json().catch(() => null)) as { message?: string; results?: ExternalBusinessResult[] } | null;
      setResults(response?.ok ? payload?.results || [] : []);
      setSearchMessage(!response?.ok ? payload?.message || "검색에 실패했습니다." : "");
      setIsSearching(false);
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function selectResult(result: ExternalBusinessResult) {
    setDraft({
      customerName: result.name,
      address: result.roadAddress || result.address,
      phone: result.phone,
      industry: result.industry,
      kakaoPlaceUrl: result.kakaoPlaceUrl
    });
    setSaveError("");
    setShowForm(true);
  }

  function startManualEntry() {
    setDraft({ ...emptyDraft, customerName: query.trim() });
    setSaveError("");
    setShowForm(true);
  }

  async function saveCustomer() {
    if (!draft.customerName.trim() || isSaving) return;

    setIsSaving(true);
    setSaveError("");

    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: draft.address,
          businessStatus: "확인 예정",
          customerName: draft.customerName,
          industry: draft.industry || "미분류",
          kakaoPlaceUrl: draft.kakaoPlaceUrl,
          phone: draft.phone,
          validateBusinessNumber: false
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "거래처 등록에 실패했습니다.");

      const customerId = String(payload?.customer?.id || "");
      if (!customerId) throw new Error("거래처는 저장됐지만 ID를 확인하지 못했습니다. 거래처 관리 화면에서 확인해주세요.");

      setCreatedCustomer({ id: customerId, customerName: draft.customerName });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "거래처 등록에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  function resetToSearch() {
    setCreatedCustomer(null);
    setShowForm(false);
    setDraft(emptyDraft);
    setQuery("");
    setResults([]);
  }

  if (createdCustomer) {
    return <MobileRegisterAttachmentStep customerId={createdCustomer.id} customerName={createdCustomer.customerName} onRegisterAnother={resetToSearch} />;
  }

  if (showForm) {
    return <MobileRegisterForm draft={draft} isSaving={isSaving} saveError={saveError} onBack={() => setShowForm(false)} onChange={setDraft} onSave={saveCustomer} />;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-teal-700 p-4 text-white shadow-[0_16px_36px_rgba(15,118,110,0.22)]">
        <p className="text-xs font-black uppercase text-white/70">Quick Register</p>
        <h1 className="mt-2 text-2xl font-black leading-tight">새 거래처를 현장에서 바로 등록하세요.</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-white/78">매장명을 검색하면 카카오맵 정보로 자동 입력됩니다. 검색 결과가 없으면 직접 입력할 수 있습니다.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            className="h-11 w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="매장명·지역 검색 (예: 성수동 카페)"
            value={query}
          />
        </label>

        {query.trim().length >= 2 ? (
          <div className="mt-3 space-y-2">
            {isSearching ? <p className="text-xs font-bold text-slate-400">검색 중...</p> : null}
            {!isSearching && searchMessage ? <p className="text-xs font-bold text-rose-600">{searchMessage}</p> : null}
            {!isSearching && !searchMessage && !results.length ? <p className="text-xs font-bold text-slate-400">검색 결과가 없습니다.</p> : null}
            {results.map((result) => (
              <button
                className="flex w-full items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-teal-200 hover:bg-teal-50"
                key={`${result.name}-${result.address}`}
                onClick={() => selectResult(result)}
                type="button"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                  <Store className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-slate-950">{result.name}</span>
                  <span className="mt-0.5 block truncate text-xs font-bold text-slate-500">{result.roadAddress || result.address || "주소 확인 필요"}</span>
                </span>
              </button>
            ))}
            <button
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs font-black text-slate-600"
              onClick={startManualEntry}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              검색 결과에 없으면 직접 입력
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs font-bold leading-5 text-slate-400">2글자 이상 입력하면 카카오맵 매장 검색 결과가 나타납니다.</p>
        )}
      </section>
    </div>
  );
}

function MobileRegisterForm({
  draft,
  isSaving,
  saveError,
  onBack,
  onChange,
  onSave
}: {
  draft: Draft;
  isSaving: boolean;
  saveError: string;
  onBack: () => void;
  onChange: (draft: Draft) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <button className="flex items-center gap-1 text-xs font-black text-slate-500" onClick={onBack} type="button">
        검색으로 돌아가기
      </button>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-black text-slate-950">거래처 정보 확인</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">상호명만 있으면 바로 저장할 수 있습니다. 나머지는 나중에 보완해도 됩니다.</p>

        <div className="mt-3 space-y-3">
          <FormField icon={Store} label="상호명 (필수)" onChange={(value) => onChange({ ...draft, customerName: value })} placeholder="상호명" value={draft.customerName} />
          <FormField icon={MapPin} label="주소" onChange={(value) => onChange({ ...draft, address: value })} placeholder="도로명 주소" value={draft.address} />
          <FormField icon={Phone} label="연락처" onChange={(value) => onChange({ ...draft, phone: value })} placeholder="010-0000-0000" value={draft.phone} />
          <FormField icon={Store} label="업종" onChange={(value) => onChange({ ...draft, industry: value })} placeholder="예: 한식, 카페" value={draft.industry} />
        </div>

        {saveError ? <p className="mt-3 text-xs font-bold text-rose-600">{saveError}</p> : null}

        <button
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-black text-white disabled:opacity-60"
          disabled={!draft.customerName.trim() || isSaving}
          onClick={onSave}
          type="button"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? "저장 중" : "거래처로 등록"}
        </button>
      </section>
    </div>
  );
}

function FormField({
  icon: Icon,
  label,
  onChange,
  placeholder,
  value
}: {
  icon: typeof Store;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-xs font-black text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <input
        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-200"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function MobileRegisterAttachmentStep({
  customerId,
  customerName,
  onRegisterAnother
}: {
  customerId: string;
  customerName: string;
  onRegisterAnother: () => void;
}) {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  async function loadAttachments() {
    setLoadState("loading");
    const response = await fetch(`/api/customer-operations?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setLoadState("error");
      return;
    }

    const payload = (await response.json().catch(() => null)) as { attachments?: AttachmentItem[] } | null;
    setAttachments(payload?.attachments || []);
    setLoadState("ready");
  }

  useEffect(() => {
    loadAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-teal-200 bg-teal-50 p-4">
        <div className="flex items-center gap-2 text-teal-800">
          <CheckCircle2 className="h-5 w-5" />
          <p className="font-black">{customerName} 등록 완료</p>
        </div>
        <p className="mt-1 text-xs font-bold leading-5 text-teal-700">
          사업자등록증, 신분증, 적재위치 사진을 업로드하면 바로 사용할 수 있도록 준비됩니다. 지금 없으면 나중에 추가해도 됩니다.
        </p>
      </section>

      {attachmentSlots.map((slot) => (
        <AttachmentSlotUploader
          accept={slot.accept}
          attachmentType={slot.key}
          customerId={customerId}
          customerName={customerName}
          description={slot.description}
          existingItems={attachments.filter((item) => item.attachmentType === slot.key)}
          key={slot.key}
          label={slot.label}
          loadState={loadState}
          onUploaded={(item) => setAttachments((current) => [item, ...current])}
        />
      ))}

      <div className="grid gap-2">
        <Link className="flex h-11 items-center justify-center rounded-xl bg-teal-700 text-sm font-black text-white" href="/mobile/today">
          오늘 코스로 이동
        </Link>
        <button className="flex h-11 items-center justify-center rounded-xl border border-slate-200 text-sm font-black text-slate-700" onClick={onRegisterAnother} type="button">
          다른 매장 등록하기
        </button>
      </div>
    </div>
  );
}

function AttachmentSlotUploader({
  accept,
  attachmentType,
  customerId,
  customerName,
  description,
  existingItems,
  label,
  loadState,
  onUploaded
}: {
  accept: string;
  attachmentType: string;
  customerId: string;
  customerName: string;
  description: string;
  existingItems: AttachmentItem[];
  label: string;
  loadState: "idle" | "loading" | "ready" | "error";
  onUploaded: (item: AttachmentItem) => void;
}) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function uploadFile(file: File | null) {
    if (!file || saveState === "saving") return;

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setSaveState("error");
      setErrorMessage(`파일 용량이 ${formatUploadSizeMb(file.size)}로 최대 50MB를 초과합니다.`);
      return;
    }

    setErrorMessage("");
    setSaveState("saving");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("customerId", customerId);
    formData.append("attachmentType", attachmentType);
    formData.append("title", `${label} - ${customerName}`);

    const response = await fetch("/api/customer-attachments/upload", { method: "POST", body: formData }).catch(() => null);

    if (!response?.ok) {
      setSaveState("error");
      setErrorMessage("업로드에 실패했습니다. 로그인 상태와 연결 상태를 확인해주세요.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as { attachment?: AttachmentItem } | null;
    if (payload?.attachment) onUploaded(payload.attachment);
    setSaveState("saved");
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-black text-slate-950">{label}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p>
        </div>
        {existingItems.length ? <span className="shrink-0 rounded-full bg-teal-50 px-2 py-1 text-[11px] font-black text-teal-800">{existingItems.length}개 등록됨</span> : null}
      </div>

      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800 transition hover:bg-blue-100">
        <input accept={accept} className="hidden" onChange={(event) => uploadFile(event.target.files?.[0] || null)} type="file" />
        {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {saveState === "saving" ? "업로드 중" : "파일 선택"}
      </label>

      {saveState === "saved" ? (
        <p className="mt-2 flex items-center gap-1 text-xs font-bold text-teal-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          업로드되었습니다.
        </p>
      ) : null}
      {saveState === "error" ? <p className="mt-2 text-xs font-bold text-rose-600">{errorMessage}</p> : null}
      {loadState === "loading" && !existingItems.length ? <p className="mt-3 text-xs font-bold text-slate-400">기존 자료를 불러오는 중...</p> : null}

      {existingItems.length ? (
        <div className="mt-3 grid gap-2">
          {existingItems.map((item) => (
            <a
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 transition hover:border-blue-200 hover:bg-blue-50"
              href={item.fileUrl || "#"}
              key={item.id}
              rel="noreferrer"
              target="_blank"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                {item.mimeType?.startsWith("video") ? <FileVideo className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-black text-slate-950">{item.title}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
