import Link from "next/link";
import { AlertTriangle, CheckCircle2, MessageCircle, ShieldCheck, Smartphone, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-white shadow-[0_20px_80px_rgba(15,23,42,0.12)]">
        <header className="border-b border-slate-200 bg-white px-4 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-700 text-sm font-black text-white shadow-[0_10px_24px_rgba(15,118,110,0.18)]">M</span>
              <div>
                <p className="text-sm font-black">MAJU Intelligence</p>
                <p className="text-xs font-bold text-slate-500">카카오 로그인</p>
              </div>
            </div>
            <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">모바일</Badge>
          </div>
        </header>

        <div className="flex-1 space-y-3 px-4 py-4">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Badge className="mb-3 bg-yellow-100 text-yellow-900 ring-1 ring-inset ring-yellow-200">
              <MessageCircle className="mr-1 h-3.5 w-3.5" />
              카카오 로그인
            </Badge>
            <h1 className="text-2xl font-black leading-snug text-slate-950">{joinMode === "company" ? "초대 확인 후 로그인" : "모바일 로그인"}</h1>
          </section>

          {errorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
                <div>
                  <p className="font-black text-rose-950">로그인 실패</p>
                  <p className="mt-1 text-sm font-bold leading-5 text-rose-800">{errorMessage}</p>
                </div>
              </div>
            </div>
          ) : null}

          {inviteCode ? (
            <section className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-700 text-[11px] font-black text-white">1</span>
                <p className="text-xs font-black text-teal-800">초대 확인</p>
              </div>
              {invitePreview ? (
                <div className="mt-3">
                  <p className="text-xs font-bold text-slate-500">회사</p>
                  <p className="text-xl font-black leading-tight text-slate-950">{invitePreview.companyName}</p>

                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-teal-100 bg-white p-3">
                    <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                    <div className="text-sm">
                      <p className="font-black text-slate-900">{invitePreview.employeeName}</p>
                      <p className="font-semibold text-slate-500">
                        {invitePreview.maskedPhone || "연락처 미등록"}
                      </p>
                    </div>
                  </div>

                  {invitePreview.status === "pending" ? (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      가입 준비 완료
                    </p>
                  ) : invitePreview.status === "accepted" ? (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      이미 가입됨
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

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-700 text-[11px] font-black text-white">{inviteCode ? "2" : "1"}</span>
              <p className="text-xs font-black text-slate-500">카카오 로그인</p>
            </div>
            <div className="mt-3">
              <OAuthLoginButtons inviteCode={inviteCode} />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
              <div>
                <p className="font-black text-slate-950">{joinMode === "company" ? "초대 기반 연결" : "초대받은 계정만 연결"}</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">회사 데이터는 관리자 초대로만 연결됩니다.</p>
              </div>
            </div>
          </section>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-4">
          <Link className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700" href="/dashboard/login">
            <Smartphone className="h-4 w-4" />
            로그인 화면으로 돌아가기
          </Link>
        </footer>
      </section>
    </main>
  );
}

// 각 프로바이더의 콜백(app/api/auth/{provider}/callback/route.ts)이 실패하면 이유를 담은
// error 코드로 이 화면에 되돌아옵니다. 초대 관련 오류(lib/store.ts에서 던지는 메시지)는
// 이미 한글이라 그대로 보여주고, 그 외 기술 코드만 안내 문구로 바꿔줍니다.
function describeOAuthError(errorCode: string): string {
  if (!errorCode) return "";

  const knownCodes: Record<string, string> = {
    invalid_oauth_state: "로그인 요청이 만료되었거나 유효하지 않습니다. 처음부터 다시 시도해주세요.",
    kakao_callback_failed: "카카오 로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    kakao_token_failed: "카카오 인증 토큰 발급에 실패했습니다. 카카오 디벨로퍼스에 등록한 Redirect URI가 정확한지 확인해주세요.",
    kakao_user_failed: "카카오 사용자 정보를 가져오지 못했습니다. 다시 시도해주세요.",
    missing_kakao_code: "카카오 인증 코드를 받지 못했습니다. 링크를 다시 눌러 처음부터 진행해주세요.",
    missing_kakao_env: "서버에 카카오 로그인 환경변수가 아직 설정되지 않았습니다.",
    naver_callback_failed: "네이버 로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    naver_token_failed: "네이버 인증 토큰 발급에 실패했습니다. 네이버 디벨로퍼스에 등록한 Callback URL이 정확한지 확인해주세요.",
    naver_user_failed: "네이버 사용자 정보를 가져오지 못했습니다. 다시 시도해주세요.",
    missing_naver_code: "네이버 인증 코드를 받지 못했습니다. 링크를 다시 눌러 처음부터 진행해주세요.",
    missing_naver_env: "서버에 네이버 로그인 환경변수가 아직 설정되지 않았습니다.",
    google_callback_failed: "구글 로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    google_token_failed: "구글 인증 토큰 발급에 실패했습니다. Google Cloud Console에 등록한 리디렉션 URI가 정확한지 확인해주세요.",
    google_user_failed: "구글 사용자 정보를 가져오지 못했습니다. 다시 시도해주세요.",
    missing_google_code: "구글 인증 코드를 받지 못했습니다. 링크를 다시 눌러 처음부터 진행해주세요.",
    missing_google_env: "서버에 구글 로그인 환경변수가 아직 설정되지 않았습니다."
  };

  return knownCodes[errorCode] || errorCode;
}
