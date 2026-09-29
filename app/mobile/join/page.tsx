import { AlertTriangle, Building2, CheckCircle2, UserRound } from "lucide-react";
import { OAuthLoginButtons } from "@/components/oauth-login-buttons";
import { getStaffInvitationPreview } from "@/lib/store";

export default async function MobileStaffJoinPage({ searchParams }: { searchParams?: Promise<{ invite?: string; error?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const inviteCode = resolvedSearchParams?.invite || "";
  const errorCode = resolvedSearchParams?.error || "";

  // 2026-09-07: /dashboard/login 우측에 "모바일 버전으로 로그인" 링크가 이 화면을 직접
  // 가리키게 되면서, 초대 코드/오류 코드 없는 "그냥 카카오 로그인" 진입도 정식 목적지가
  // 되었습니다. 예전에는 /dashboard/login과 중복이라 여기로 튕겨보냈지만, 이제는 모바일
  // 화면에 최적화된 이 페이지가 그 용도를 담당하므로 리다이렉트를 없앴습니다.
  const joinMode = inviteCode ? "company" : "personal";
  const errorMessage = describeOAuthError(errorCode);
  const invitePreview = inviteCode ? await getStaffInvitationPreview(inviteCode).catch(() => null) : null;
  const canContinue = !inviteCode || invitePreview?.status === "pending" || invitePreview?.status === "accepted";

  return (
    <main className="grid min-h-screen place-items-center bg-[#111827] px-4 py-6 text-slate-950">
      <section className="w-full max-w-[420px] rounded-[24px] border border-white/10 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <header className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-600 text-sm font-semibold text-white">M</span>
          <div>
            <p className="text-xs font-medium text-slate-500">MAJU 현장 운영</p>
            <h1 className="text-xl font-bold tracking-[-0.025em]">{joinMode === "company" ? "회사 초대 확인" : "직원 로그인"}</h1>
          </div>
        </header>

        <div className="mt-5 space-y-3">

          {errorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3" role="alert">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
                <div>
                  <p className="mt-1 text-sm font-bold leading-5 text-rose-800">{errorMessage}</p>
                </div>
              </div>
            </div>
          ) : null}

          {inviteCode ? (
            <section className="rounded-xl border border-lime-200 bg-lime-50 p-4">
              {invitePreview ? (
                <div>
                  <p className="text-lg font-bold text-slate-950">{invitePreview.companyName}</p>
                  <p className="mt-1 text-sm font-medium text-slate-600">{invitePreview.employeeName} · {invitePreview.maskedPhone || "연락처 미등록"}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">담당 업무 · {getRoleLabel(invitePreview.role)}</p>
                  {invitePreview.status === "pending" ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      유효한 초대
                    </p>
                  ) : invitePreview.status === "accepted" ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      등록된 직원
                    </p>
                  ) : (
                    <p className="mt-3 text-xs font-bold text-amber-800">
                      만료된 초대입니다. 관리자에게 새 링크를 요청하세요.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900">
                  초대 확인 실패. 관리자에게 새 링크를 요청하세요.
                </p>
              )}
            </section>
          ) : null}

          {inviteCode && invitePreview && canContinue ? (
            <section aria-label="가입 후 연결 결과" className="rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3">
              <p className="text-xs font-black text-teal-950">인증 후 바로 연결</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-bold text-teal-800">
                <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{invitePreview.companyName}</span>
                <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{invitePreview.employeeName} · 배정 코스</span>
              </div>
            </section>
          ) : null}

          {canContinue ? <OAuthLoginButtons inviteCode={inviteCode} /> : null}
          <p className="text-center text-xs font-medium leading-5 text-slate-500">
            {inviteCode ? "카카오 인증 후 배정된 현장 업무로 이동합니다." : "최초 등록은 회사 관리자가 보낸 초대 링크에서 진행하세요."}
          </p>
        </div>
      </section>
    </main>
  );
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    admin: "관리자",
    driver: "배송기사",
    manager: "현장관리자",
    member: "일반직원",
    owner: "대표",
    sales: "영업직원"
  };
  return labels[role] || role;
}

// 각 프로바이더의 콜백(app/api/auth/{provider}/callback/route.ts)이 실패하면 이유를 담은
// error 코드로 이 화면에 되돌아옵니다. 초대 관련 오류(lib/store.ts에서 던지는 메시지)는
// 이미 한글이라 그대로 보여주고, 그 외 기술 코드만 안내 문구로 바꿔줍니다.
function describeOAuthError(errorCode: string): string {
  if (!errorCode) return "";

  const knownCodes: Record<string, string> = {
    invalid_oauth_state: "로그인 시간이 만료되었습니다. 다시 시도해주세요.",
    kakao_callback_failed: "카카오 로그인을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.",
    kakao_token_failed: "카카오 인증을 완료하지 못했습니다. 관리자에게 문의해주세요.",
    kakao_user_failed: "카카오 계정 정보를 확인하지 못했습니다. 다시 시도해주세요.",
    missing_kakao_code: "카카오 인증이 취소되었습니다. 다시 시도해주세요.",
    missing_kakao_env: "카카오 로그인을 사용할 수 없습니다. 관리자에게 문의해주세요.",
    naver_callback_failed: "로그인을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.",
    naver_token_failed: "인증을 완료하지 못했습니다. 관리자에게 문의해주세요.",
    naver_user_failed: "계정 정보를 확인하지 못했습니다. 다시 시도해주세요.",
    missing_naver_code: "인증이 취소되었습니다. 다시 시도해주세요.",
    missing_naver_env: "현재 로그인을 사용할 수 없습니다. 관리자에게 문의해주세요.",
    google_callback_failed: "로그인을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.",
    google_token_failed: "인증을 완료하지 못했습니다. 관리자에게 문의해주세요.",
    google_user_failed: "계정 정보를 확인하지 못했습니다. 다시 시도해주세요.",
    missing_google_code: "인증이 취소되었습니다. 다시 시도해주세요.",
    missing_google_env: "현재 로그인을 사용할 수 없습니다. 관리자에게 문의해주세요."
  };

  return knownCodes[errorCode] || "로그인 요청을 처리하지 못했습니다. 초대 링크에서 다시 시작해주세요.";
}
