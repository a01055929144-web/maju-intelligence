"use client";

import { useState } from "react";
import { koreaDay } from "@/domains/pricing/document";
import type { ExtensionMode, ExtensionReview } from "@/lib/pricing/document-extension-client";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";

export function PricingDocumentExtensionChoice({ validUntil, busy, error, onClose, onContinue }: {
  validUntil: string; busy: boolean; onClose: () => void;
  error?: string;
  onContinue: (mode: ExtensionMode, day: string) => void;
}) {
  const [mode, setMode] = useState<ExtensionMode | "">("");
  const [day, setDay] = useState("");
  return <Dialog title="약속가 연장" onClose={onClose} fullScreenOnMobile>
    <div className="space-y-4 pt-4">
      {error && <p role="alert">{error}</p>}
      <p>현재 유효기간 {validUntil}. 방법을 고른 뒤 기존 문서 편집기에서 품목·단가·순서·숨김·기간을 확인합니다.</p>
      <label className="block">새 유효기간<input aria-label="새 유효기간" className="maju-input block min-h-11 w-full" type="date" value={day} min={validUntil > koreaDay() ? validUntil : koreaDay()} onChange={e => setDay(e.target.value)} disabled={busy} /></label>
      <fieldset><legend>연장 방법 (필수)</legend>
        {([ ["keep", "약속가 그대로 연장"], ["latest", "최신 가격으로 다시 계산"] ] as const).map(([value, label]) =>
          <label className="flex min-h-11 items-center gap-2" key={value}><input type="radio" name="extension-mode" value={value} checked={mode === value} onChange={() => setMode(value)} disabled={busy} />{label}</label>)}
      </fieldset>
      <p>새 게시본을 확정하기 전까지 기존 약속가와 링크는 그대로입니다. 이익률 경고는 게시를 막지 않습니다.</p>
      <Button className="min-h-11" disabled={busy || !mode || !day || day <= validUntil || day < koreaDay()} onClick={() => mode && onContinue(mode, day)}>기존 편집기에서 확인</Button>
    </div>
  </Dialog>;
}

export function PricingDocumentExtensionReport({ review }: { review: ExtensionReview }) {
  const s = review.summary;
  return <section aria-label="연장 게시 전 요약" className="space-y-3">
    <p>그대로 {s.unchanged} · 가격 바뀜 {s.changed} · 추가 {s.added} · 삭제 {s.removed}</p>
    <p role="status">이익 낮아진 품목 {review.loweredProfitCount}개 · 최저 이익률 {review.minimumProfitRate === null ? "확인 필요" : `${review.minimumProfitRate}%`}. 경고는 게시를 막지 않습니다.</p>
    <ul className="space-y-2">{review.lines.map(line => <li key={line.key} className="break-words rounded border p-3 text-sm">
      <p>{line.name} · {line.manual ? "직접 수정" : "계산가"}</p>
      <p>기존 {line.before ?? "추가"} → 단가 {line.price}원 · 계산가 {line.calculated}원 · 계산가와 차이 {line.difference}원</p>
      <p>이익률 {line.profitRate === null ? "확인 필요" : `${line.profitRate}%`}{line.belowThreshold ? " · 기준 미만 경고" : ""}</p>
    </li>)}</ul>
  </section>;
}
