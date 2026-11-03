"use client";

/** 내 계정 로그인 방법: 아이디 + 카카오 간편 로그인을 한 계정으로 연결합니다. */
export function MyAccountLoginCard({ kakao, loginId, status }: { kakao: boolean; loginId: string; status?: string }) {
  const notice =
    status === "linked" ? { ok: true, text: "카카오를 연결했습니다. 이제 카카오로도 같은 계정에 로그인합니다." }
      : status === "already" ? { ok: true, text: "이미 이 계정에 연결된 카카오입니다." }
        : status === "in_use" ? { ok: false, text: "이 카카오는 다른 계정에 연결돼 있습니다. MAJU 관리자에게 계정 합치기를 요청하세요." }
          : null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" id="my-account">
      <p className="text-base font-black text-slate-950">내 계정 로그인</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-[11px] font-black text-slate-500">아이디</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{loginId || "없음 — MAJU 관리자에게 발급을 요청하세요."}</p>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
          <div>
            <p className="text-[11px] font-black text-slate-500">카카오 간편 로그인</p>
            <p className={`mt-1 text-sm font-bold ${kakao ? "text-teal-700" : "text-slate-500"}`}>{kakao ? "연결됨" : "연결 안 됨"}</p>
          </div>
          {!kakao ? <a className="maju-button-primary h-9 px-3 text-xs" href="/api/auth/kakao/start?link=1">카카오 연결</a> : null}
        </div>
      </div>
      {notice ? <p className={`mt-2 rounded-md px-3 py-2 text-xs font-bold ${notice.ok ? "bg-teal-50 text-teal-800" : "bg-rose-50 text-rose-700"}`}>{notice.text}</p> : null}
    </section>
  );
}
