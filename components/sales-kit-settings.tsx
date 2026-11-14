"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Notice } from "@/components/ui/notice";
import { Check, Copy, Loader2, Trash2, Upload } from "lucide-react";
import {
  SALES_KIT_FIELD_LABEL,
  SALES_KIT_FIELDS,
  SALES_MATERIAL_KINDS,
  SALES_MATERIAL_LABEL,
  type SalesKitSettings,
  type SalesMaterialKind
} from "@/domains/lead/sales-kit";

/** 11/4: 회사 정보 › 영업 정보 — DM 문구 아래 붙일 단가표·명함·브로슈어·카탈로그·주문 링크·연락처. */
export function SalesKitSettingsPanel() {
  const { confirm, confirmDialog } = useConfirm();
  const [kit, setKit] = useState<SalesKitSettings | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [fallbackPhone, setFallbackPhone] = useState("");
  const [kind, setKind] = useState<SalesMaterialKind>("price_sheet");
  const [busy, setBusy] = useState<"" | "upload" | "save" | string>("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    void fetch("/api/sales-kit", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { canEdit?: boolean; fallbackPhone?: string; kit?: SalesKitSettings } | null) => {
        if (!payload?.kit) return;
        setKit(payload.kit);
        setCanEdit(Boolean(payload.canEdit));
        setFallbackPhone(payload.fallbackPhone || "");
      })
      .catch(() => null);
  }, []);

  async function upload(file: File) {
    setBusy("upload");
    setNotice(null);
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    const response = await fetch("/api/sales-kit/file", { body: form, method: "POST" }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { kit?: SalesKitSettings; message?: string } | null;
    if (response?.ok && payload?.kit) {
      setKit(payload.kit);
      setNotice({ ok: true, text: `${SALES_MATERIAL_LABEL[kind]}을(를) 올렸습니다.` });
    } else setNotice({ ok: false, text: payload?.message || "업로드하지 못했습니다." });
    setBusy("");
  }

  async function remove(code: string) {
    const name = kit?.materials.find((item) => item.code === code)?.name;
    if (!(await confirm({ body: `${name ? `"${name}" ` : "이 "}자료를 삭제합니다. 이미 보낸 링크도 열리지 않습니다.`, confirmLabel: "삭제" }))) return;
    setBusy(code);
    const response = await fetch(`/api/sales-kit/file?code=${encodeURIComponent(code)}`, { method: "DELETE" }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { kit?: SalesKitSettings; message?: string } | null;
    if (response?.ok && payload?.kit) setKit(payload.kit);
    else setNotice({ ok: false, text: payload?.message || "삭제하지 못했습니다." });
    setBusy("");
  }

  async function save(next: SalesKitSettings) {
    setBusy("save");
    setNotice(null);
    const response = await fetch("/api/sales-kit", { body: JSON.stringify(next), headers: { "Content-Type": "application/json" }, method: "PUT" }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { kit?: SalesKitSettings; message?: string } | null;
    if (response?.ok && payload?.kit) {
      setKit(payload.kit);
      setNotice({ ok: true, text: "저장했습니다. 리드 상세의 보낼 문구 아래에 바로 반영됩니다." });
    } else setNotice({ ok: false, text: payload?.message || "저장하지 못했습니다." });
    setBusy("");
  }

  async function copyLink(code: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/m/${code}`).catch(() => null);
    setCopied(code);
    window.setTimeout(() => setCopied(""), 1500);
  }

  if (!kit) return null;
  const input = "h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="sales-kit-title">
      {confirmDialog}
      <h2 className="text-base font-black text-slate-950" id="sales-kit-title">영업 자료</h2>
      <p className="mt-1 text-xs font-semibold text-slate-500">리드에게 보내는 문구 아래에 짧은 링크로 붙습니다. 링크를 연 사람은 파일을 바로 볼 수 있습니다.</p>

      <div className="mt-4 space-y-2">
        {SALES_MATERIAL_KINDS.map((materialKind) => {
          const items = kit.materials.filter((item) => item.kind === materialKind);
          return (
            <div className="grid gap-2 border-b border-slate-100 pb-2 sm:grid-cols-[96px_minmax(0,1fr)]" key={materialKind}>
              <p className="pt-1.5 text-sm font-black text-slate-700">{SALES_MATERIAL_LABEL[materialKind]}</p>
              <div className="min-w-0 space-y-1">
                {items.length ? items.map((item) => (
                  <div className="flex min-w-0 items-center gap-2 text-sm" key={item.code}>
                    <label className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        checked={(kit.defaults[materialKind] || items[items.length - 1]?.code) === item.code}
                        disabled={!canEdit || busy === "save"}
                        name={`default-${materialKind}`}
                        onChange={() => void save({ ...kit, defaults: { ...kit.defaults, [materialKind]: item.code } })}
                        type="radio"
                      />
                      <span className="min-w-0 truncate font-semibold text-slate-800">{item.name}</span>
                    </label>
                    <button className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-bold text-slate-600" onClick={() => void copyLink(item.code)} type="button">
                      {copied === item.code ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
                      /m/{item.code}
                    </button>
                    {canEdit ? (
                      <button aria-label={`${item.name} 삭제`} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600" disabled={busy === item.code} onClick={() => void remove(item.code)} type="button">
                        {busy === item.code ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    ) : null}
                  </div>
                )) : <p className="pt-1.5 text-xs font-semibold text-slate-400">없음</p>}
              </div>
            </div>
          );
        })}
        {kit.materials.length ? <p className="text-[11px] font-semibold text-slate-400">동그라미로 고른 자료가 기본으로 붙습니다.</p> : null}
      </div>

      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="올릴 자료 종류" className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold" onChange={(event) => setKind(event.target.value as SalesMaterialKind)} value={kind}>
            {SALES_MATERIAL_KINDS.map((item) => <option key={item} value={item}>{SALES_MATERIAL_LABEL[item]}</option>)}
          </select>
          <label className={`maju-button-primary h-9 cursor-pointer px-3 text-xs ${busy === "upload" ? "pointer-events-none opacity-60" : ""}`}>
            {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            파일 올리기 (PDF·JPG·PNG)
            <input accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} type="file" />
          </label>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-black text-slate-600">
          주문 링크
          <input className={`${input} mt-1`} disabled={!canEdit} onChange={(event) => setKit({ ...kit, orderUrl: event.target.value })} placeholder="https:// (카카오 채널·주문 페이지 등)" value={kit.orderUrl} />
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2">
          <label className="text-xs font-black text-slate-600">
            문의 이름
            <input className={`${input} mt-1`} disabled={!canEdit} onChange={(event) => setKit({ ...kit, contactLabel: event.target.value })} placeholder="회사명" value={kit.contactLabel} />
          </label>
          <label className="text-xs font-black text-slate-600">
            문의 연락처
            <input className={`${input} mt-1`} disabled={!canEdit} inputMode="tel" onChange={(event) => setKit({ ...kit, contactPhone: event.target.value })} placeholder={fallbackPhone || "대표 휴대폰"} value={kit.contactPhone} />
          </label>
        </div>
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-400">문의 연락처를 비우면 회사 정보의 대표 휴대폰이 들어갑니다.</p>

      <fieldset className="mt-4">
        <legend className="text-xs font-black text-slate-600">문구 아래에 기본으로 붙일 항목</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {SALES_KIT_FIELDS.map((field) => (
            <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700" key={field}>
              <input
                checked={kit.fields.includes(field)}
                disabled={!canEdit}
                onChange={(event) => setKit({ ...kit, fields: event.target.checked ? SALES_KIT_FIELDS.filter((item) => item === field || kit.fields.includes(item)) : kit.fields.filter((item) => item !== field) })}
                type="checkbox"
              />
              {SALES_KIT_FIELD_LABEL[field]}
            </label>
          ))}
        </div>
      </fieldset>

      {canEdit ? (
        <button className="maju-button-primary mt-4 h-9 px-4 text-xs" disabled={busy === "save"} onClick={() => void save(kit)} type="button">
          {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          저장
        </button>
      ) : null}
      {notice ? <Notice className="mt-2" kind={notice.ok ? "success" : "error"}>{notice.text}</Notice> : null}
    </section>
  );
}
