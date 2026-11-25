"use client";

import { useEffect, useState } from "react";

type State = { registered: boolean; last4: string | null; notices: Array<{ id: string; kind: "declined" | "owner_conflict"; phoneLast4: string; createdAt: string }> };
const noticeText = { declined: "점주가 \"내 매장이 아님\"이라고 답했습니다. 번호가 맞는지 확인해 주세요.", owner_conflict: "이미 다른 점주가 연결돼 있어 자동 연결하지 않았습니다. 점주 확인이 필요합니다." } as const;

/** CX-146: 거래처 '점주 휴대폰' 입력(010 형식)과 알림(겹침·거절). 기능이 꺼진 회사는 404라 아무것도 그리지 않는다. 번호는 뒤 4자리만 보인다. */
export function CustomerOwnerMobileCard({ customerId }: { customerId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const url = `/api/customers/${encodeURIComponent(customerId)}/owner-mobile`;
  useEffect(() => {
    let live = true;
    setState(null); setValue(""); setMessage("");
    fetch(url, { cache: "no-store" }).then(async response => response.ok ? await response.json() as State : null).then(next => { if (live) setState(next); }).catch(() => undefined);
    return () => { live = false; };
  }, [url]);
  async function send(body: unknown, done: string) {
    setMessage("");
    const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;
    if (!response?.ok) { setMessage(payload?.message || "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."); return; }
    setState(payload); setValue(""); setMessage(done);
  }
  if (!state) return null;
  const valid = /^010[-\s]?\d{4}[-\s]?\d{4}$/.test(value.trim());
  return <section aria-label="점주 휴대폰" className="mt-4 space-y-2 rounded-lg border bg-white p-3">
    <h4 className="text-sm font-semibold">점주 휴대폰 <span className="font-normal text-slate-500">(점주가 카카오로 로그인하면 이 번호의 매장이 연결됩니다)</span></h4>
    <p className="text-sm text-slate-600">{state.registered ? `등록됨 (010-****-${state.last4}) · 바꾸려면 새 번호를 입력하세요` : "아직 등록하지 않았습니다. 같은 번호를 여러 매장에 넣어도 됩니다."}</p>
    <div className="flex flex-wrap gap-2">
      <input aria-label="점주 휴대폰" autoComplete="off" className="min-h-11 w-48 rounded-lg border px-3" inputMode="tel" maxLength={13} onChange={event => setValue(event.target.value)} placeholder="010-0000-0000" value={value} />
      <button className="maju-button-primary min-h-11 px-4 text-sm disabled:opacity-50" disabled={!valid} onClick={() => send({ ownerMobile: value }, "저장했습니다.")} type="button">저장</button>
      {state.registered ? <button className="min-h-11 rounded-lg border px-4 text-sm" onClick={() => send({ ownerMobile: null }, "삭제했습니다.")} type="button">번호 삭제</button> : null}
    </div>
    {value && !valid ? <p className="text-sm text-rose-700">010으로 시작하는 휴대폰 번호 11자리를 입력해 주세요.</p> : null}
    {message ? <p role="status" className="text-sm text-slate-700">{message}</p> : null}
    {state.notices.length ? <ul aria-label="점주 연결 알림" className="space-y-2">{state.notices.map(notice => <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900" key={notice.id}>
      <span>{noticeText[notice.kind]} (번호 끝 {notice.phoneLast4})</span>
      <button className="min-h-11 rounded-lg border bg-white px-3" onClick={() => send({ resolveNoticeId: notice.id }, "확인 처리했습니다.")} type="button">확인했어요</button></li>)}</ul> : null}
  </section>;
}
