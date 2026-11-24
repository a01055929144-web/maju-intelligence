"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Crosshair } from "lucide-react";
import {
  buildFieldRecordForm, FIELD_MEDIA_MAX_COUNT, FIELD_PLACEMENT_LABELS, FIELD_PLACEMENT_TYPES, FIELD_RECORD_KIND_LABELS, FIELD_RECORD_KINDS, FIELD_VIDEO_MAX_SECONDS,
  validateFieldMedia, type FieldPlacementType, type FieldRecordKind
} from "@/domains/field-record/field-record";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type Geo = { accuracyM: number; latitude: number; longitude: number };
type Props = { readonly customerId?: string; readonly leadId?: string; readonly targetName?: string };

const newKey = () => `fr-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;

function readVideoSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file), video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video.duration); };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(Number.NaN); };
    video.src = url;
  });
}

/** 기사·영업·알바 공통 [현장 기록]: 종류 + 사진/영상 + 자동 위치·시각. 사진이 1장 이상이어야 방문으로 인정된다. */
export function FieldRecordPanel({ customerId, leadId, targetName }: Props) {
  const [kind, setKind] = useState<FieldRecordKind>("visit");
  const [placement, setPlacement] = useState<FieldPlacementType[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [video, setVideo] = useState<{ durationSeconds: number; file: File } | null>(null);
  const [memo, setMemo] = useState("");
  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoMessage, setGeoMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ countsAsVisit: boolean } | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);

  const locate = useCallback(() => {
    setGeoMessage("위치를 확인하는 중입니다.");
    if (!navigator.geolocation) { setGeo(null); setGeoMessage("이 기기에서는 위치를 확인할 수 없습니다."); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => { setGeo({ accuracyM: position.coords.accuracy, latitude: position.coords.latitude, longitude: position.coords.longitude }); setGeoMessage(""); },
      () => { setGeo(null); setGeoMessage("위치 권한을 허용해야 기록할 수 있습니다. 브라우저 설정에서 위치를 허용한 뒤 다시 눌러 주세요."); },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 }
    );
  }, []);
  useEffect(() => { locate(); }, [locate]);

  const mediaCheck = validateFieldMedia([
    ...photos.map((file) => ({ mimeType: file.type, size: file.size })),
    ...(video ? [{ durationSeconds: video.durationSeconds, mimeType: video.file.type, size: video.file.size }] : [])
  ]);
  const needsMaterial = kind === "placement" && placement.length === 0;
  const canSubmit = !busy && Boolean(geo) && !needsMaterial && mediaCheck.ok;

  async function pickVideo(file: File | undefined) {
    if (!file) { setVideo(null); return; }
    const seconds = await readVideoSeconds(file);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > FIELD_VIDEO_MAX_SECONDS) {
      setVideo(null); setError(`영상은 ${FIELD_VIDEO_MAX_SECONDS}초 이하만 올릴 수 있습니다.`); return;
    }
    setError(""); setVideo({ durationSeconds: Math.round(seconds * 100) / 100, file });
  }

  async function submit() {
    if (!canSubmit || !geo) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const form = buildFieldRecordForm({ ...geo, capturedAt: new Date().toISOString(), customerId, idempotencyKey, kind, leadId, memo, photos, placementTypes: placement, video });
      const response = await fetchWithTimeout("/api/field-records", { method: "POST", body: form }, 60_000);
      const body = await response.json().catch(() => ({})) as { countsAsVisit?: boolean; message?: string };
      if (!response.ok) throw new Error(body.message || "현장 기록을 저장하지 못했습니다. 같은 화면에서 다시 눌러 주세요.");
      setResult({ countsAsVisit: body.countsAsVisit === true });
      setPhotos([]); setVideo(null); setMemo(""); setPlacement([]); setIdempotencyKey(newKey());
    } catch (cause) {
      // 같은 식별값으로 다시 누르면 같은 기록으로 처리되어 중복 저장되지 않는다.
      setError(cause instanceof Error ? cause.message : "현장 기록을 저장하지 못했습니다.");
    } finally { setBusy(false); }
  }

  return (
    <section aria-label="현장 기록" className="mobile-card space-y-3 rounded-xl border p-3">
      <div>
        <p className="text-sm font-semibold">현장 기록</p>
        <p className="mobile-muted text-xs">{targetName ? `대상: ${targetName}` : "대상: 지금 있는 위치(지도 위치)"} · 사진 1장 이상이어야 방문으로 인정됩니다.</p>
      </div>
      <div aria-label="기록 종류" className="grid grid-cols-3 gap-2" role="group">
        {FIELD_RECORD_KINDS.map((item) => (
          <button aria-pressed={kind === item} className={`min-h-11 rounded-lg text-sm font-bold ${kind === item ? "mobile-primary-action" : "mobile-secondary-action border"}`} key={item} onClick={() => setKind(item)} type="button">
            {FIELD_RECORD_KIND_LABELS[item]}
          </button>
        ))}
      </div>
      {kind === "placement" ? (
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold">비치한 자료(1개 이상)</legend>
          <div className="flex flex-wrap gap-2">
            {FIELD_PLACEMENT_TYPES.map((item) => (
              <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold" key={item}>
                <input checked={placement.includes(item)} onChange={(event) => setPlacement((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} type="checkbox" />
                {FIELD_PLACEMENT_LABELS[item]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="mobile-secondary-action inline-flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-lg border text-sm font-semibold">
          <Camera aria-hidden="true" className="h-4 w-4" />사진 찍기·선택 {photos.length ? `(${photos.length})` : ""}
          <input accept="image/*" capture="environment" className="sr-only" multiple onChange={(event) => setPhotos(Array.from(event.target.files ?? []).slice(0, FIELD_MEDIA_MAX_COUNT))} type="file" />
        </label>
        <label className="mobile-secondary-action inline-flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-lg border text-sm font-semibold">
          영상(선택 · {FIELD_VIDEO_MAX_SECONDS}초) {video ? "✓" : ""}
          <input accept="video/*" capture="environment" className="sr-only" onChange={(event) => void pickVideo(event.target.files?.[0])} type="file" />
        </label>
      </div>
      {!photos.length ? <p className="text-xs font-semibold text-amber-700">사진이 없으면 저장은 되지만 방문으로 인정되지 않습니다.</p> : null}
      {!mediaCheck.ok ? <p className="text-xs font-semibold text-red-700" role="alert">{mediaCheck.message}</p> : null}
      <label className="block text-xs font-semibold">메모(선택)
        <textarea className="mt-1 w-full rounded-lg border p-2 text-sm" maxLength={500} onChange={(event) => setMemo(event.target.value)} rows={2} value={memo} />
      </label>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={geo ? "mobile-muted" : "font-semibold text-red-700"}>{geo ? `위치 확인됨 · 오차 ${Math.round(geo.accuracyM)}m` : geoMessage || "위치 확인 전"}</span>
        <button className="mobile-secondary-action inline-flex min-h-9 items-center gap-1 rounded-lg border px-2 font-semibold" onClick={locate} type="button"><Crosshair aria-hidden="true" className="h-3.5 w-3.5" />위치 다시 확인</button>
      </div>
      {error ? <p className="flex items-start gap-1 text-xs font-semibold text-red-700" role="alert"><AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p> : null}
      {result ? (
        <p className={`flex items-start gap-1 text-xs font-semibold ${result.countsAsVisit ? "text-teal-700" : "text-amber-700"}`} role="status">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {result.countsAsVisit ? "기록했습니다. 방문으로 인정됩니다." : "기록했습니다. 사진이 없어 방문으로 인정되지 않습니다."}
        </p>
      ) : null}
      <button className="mobile-primary-action min-h-12 w-full rounded-lg text-sm font-black disabled:opacity-50" disabled={!canSubmit} onClick={() => void submit()} type="button">
        {busy ? "저장 중…" : "기록 저장"}
      </button>
      {needsMaterial ? <p className="text-xs font-semibold text-amber-700">비치한 자료를 1개 이상 선택해 주세요.</p> : null}
    </section>
  );
}
