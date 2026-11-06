"use client";
import { useRef, useState } from "react";
import type { DocumentVersion } from "@/domains/pricing/document";
import type { PreparedDocumentShare } from "@/domains/pricing/document-share";
import type { DocumentSendResult } from "@/domains/pricing/document-send";
import { documentRequest } from "@/lib/pricing/document-client";

export function PricingLeadDocumentShare({ companyId, leadId, documentId, versions, onDeliveryRecorded }: { companyId: string; leadId: string; documentId: string; versions: DocumentVersion[]; onDeliveryRecorded?: () => void }) {
  const [versionId, setVersionId] = useState(versions.find(v => v.documentId === documentId)?.id || ""), [ttlDays, setTtlDays] = useState(14);
  const [prepared, setPrepared] = useState<PreparedDocumentShare | null>(null), [sendId, setSendId] = useState("");
  const [confirmed, setConfirmed] = useState(false), [revoked, setRevoked] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const retry = useRef<{ documentId: string; documentVersionId: string; leadId: string; ttlDays: number; idempotencyKey: string } | null>(null);
  const delivery = useRef<Record<string, unknown> | null>(null);
  const box = "min-h-[44px] rounded border px-3 disabled:opacity-50";
  async function task(run: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await run(); } catch (e) { setError(e instanceof Error ? e.message : "요청을 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  const documentVersions = versions.filter(v => v.documentId === documentId);
  const chosen = documentVersions.find(v => v.id === versionId);
  return <section className="pricing-no-print space-y-3 rounded border p-3" aria-label="리드 문서 공유">
    <h2 className="font-semibold">게시 문서 링크</h2>
    <p className="text-sm">링크 준비·복사는 전달 완료가 아닙니다. 실제 전달한 뒤 별도로 확인해 주세요.</p>
    <div className="flex flex-wrap items-center gap-2">
      <label>공유 버전 <select aria-label="공유 버전" className={box} disabled={busy || Boolean(retry.current)} value={versionId} onChange={e => setVersionId(e.target.value)}>
        {documentVersions.map(v => <option key={v.id} value={v.id}>버전 {v.version}</option>)}
      </select></label>
      <label>링크 기간 <input aria-label="링크 기간" className={`${box} w-20`} type="number" min={1} max={30} disabled={busy || Boolean(retry.current)} value={ttlDays} onChange={e => setTtlDays(Number(e.target.value))} />일</label>
      <button className={box} disabled={busy || !chosen || Boolean(prepared)} onClick={() => void task(async () => {
        if (!chosen || chosen.documentId !== documentId) throw new Error("선택한 문서의 게시 버전을 다시 확인해 주세요.");
        if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 30) throw new Error("링크 기간은 1~30일로 입력해 주세요.");
        if (!retry.current) retry.current = { documentId, documentVersionId: versionId, leadId, ttlDays, idempotencyKey: crypto.randomUUID() };
        const r = await documentRequest<PreparedDocumentShare>(companyId, "prepare-share", retry.current, true);
        setPrepared(r.result); setMessage("링크를 준비했습니다. 아직 전달 기록은 없습니다.");
      })}>링크 준비</button>
    </div>
    {prepared && <div className="space-y-2 text-sm">
      <p>링크 만료: {new Date(prepared.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
      <div className="flex flex-wrap gap-2">
        <button className={box} disabled={busy || revoked} onClick={() => void task(async () => {
          await navigator.clipboard.writeText(new URL(prepared.publicUrl, window.location.origin).href);
          setMessage("링크를 복사했습니다. 실제 전달 후 전달 완료를 확인해 주세요.");
        })}>링크 복사</button>
        {!revoked && <a className={`${box} inline-flex items-center`} href={prepared.publicUrl} target="_blank" rel="noopener noreferrer">공유 문서 열기</a>}
        <button className={box} disabled={busy || revoked} onClick={() => void task(async () => {
          await documentRequest(companyId, "revoke-share", { shareLinkId: prepared.shareLinkId }, true);
          setRevoked(true); setMessage("링크를 회수했습니다. 새 조회가 차단됩니다.");
        })}>링크 회수</button>
      </div>
      {!sendId && !revoked && <>
        <label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={confirmed} disabled={busy || Boolean(delivery.current)} onChange={e => setConfirmed(e.target.checked)} />복사한 링크를 리드에게 실제로 전달했습니다.</label>
        <button className={box} disabled={busy || !confirmed} onClick={() => void task(async () => {
          if (!delivery.current) delivery.current = { shareLinkId: prepared.shareLinkId, documentVersionId: prepared.documentVersionId,
            leadId, idempotencyKey: retry.current!.idempotencyKey, templateId: "pricing-doc-paper-v1", channel: "link", delivered: true };
          const r = await documentRequest<DocumentSendResult>(companyId, "record-send", delivery.current, true);
          setSendId(r.result.sendId); setMessage("실제 전달 기록을 확인했습니다."); onDeliveryRecorded?.();
        })}>실제 전달 완료 기록</button>
      </>}
      {sendId && <p>전달 완료 기록됨 · 링크 열람은 수락이나 주문이 아닙니다.</p>}
      {revoked && <button className={box} disabled={busy} onClick={() => { retry.current = null; delivery.current = null; setPrepared(null); setSendId(""); setConfirmed(false); setRevoked(false); setMessage(""); }}>새 링크 준비하기</button>}
    </div>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
