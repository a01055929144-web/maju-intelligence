import Link from "next/link";
import { ChevronRight, ClipboardCheck, KeyRound, MapPinned, MessageCircle, ShieldCheck, Smartphone, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function MobileStaffJoinPage({ searchParams }: { searchParams?: { invite?: string } }) {
  const inviteCode = searchParams?.invite || "";
  const kakaoLoginUrl = createKakaoLoginUrl(inviteCode);
  const kakaoReady = Boolean(kakaoLoginUrl);
  const joinMode = inviteCode ? "company" : "personal";

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-white shadow-[0_20px_80px_rgba(15,23,42,0.12)]">
        <header className="border-b border-slate-200 bg-white px-5 pb-5 pt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-700 text-sm font-black text-white shadow-[0_10px_24px_rgba(15,118,110,0.18)]">M</span>
              <div>
                <p className="text-sm font-black">MAJU Intelligence</p>
                <p className="text-xs font-bold text-slate-500">{joinMode === "company" ? "직원 모바일 가입" : "개인 워크스페이스 시작"}</p>
              </div>
            </div>
            <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">Mobile</Badge>
          </div>
        </header>

        <div className="flex-1 space-y-5 px-5 py-6">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <Badge className="mb-4 bg-yellow-100 text-yellow-900 ring-1 ring-inset ring-yellow-200">
              <MessageCircle className="mr-1 h-3.5 w-3.5" />
              {joinMode === "company" ? "카카오톡 초대" : "개인으로 시작"}
            </Badge>
            <h1 className="text-[28px] font-black leading-tight text-slate-950">
              {joinMode === "company" ? "카카오로 가입하고 오늘 코스를 바로 확인하세요." : "카카오로 가입하고 내 거래처 관리를 시작하세요."}
            </h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
              {joinMode === "company"
                ? "배송기사와 영업직원은 모바일에서 배정 코스, 거래처 정보, 적재위치 사진, 방문 메모를 빠르게 처리합니다."
                : "초대 코드가 없어도 개인 워크스페이스를 만들고 거래처, 방문 기록, 매출 데이터를 혼자 관리할 수 있습니다."}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black text-slate-500">{joinMode === "company" ? "초대 코드" : "가입 방식"}</p>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-3">
              <span className="min-w-0 truncate font-mono text-sm font-black text-slate-900">{inviteCode || "개인 워크스페이스"}</span>
              <Badge className={inviteCode ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}>{inviteCode ? "회사 연결" : "개인"}</Badge>
            </div>
          </section>

          <section className="grid gap-3">
            <MobileBenefit icon={Truck} title="오늘 코스" description="내 배송차 또는 영업 담당 코스를 모바일에서 확인합니다." />
            <MobileBenefit icon={MapPinned} title="거래처 위치" description="출발지, 경유지, 거래처 주소와 간략 정보를 바로 봅니다." />
            <MobileBenefit icon={ClipboardCheck} title="현장 기록" description="방문 결과, 배송 특이사항, 사진과 메모를 남깁니다." />
          </section>

          {kakaoReady ? (
            <a
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-4 py-4 text-base font-black text-[#191919] shadow-[0_10px_24px_rgba(250,204,21,0.20)] transition hover:brightness-95"
              href={kakaoLoginUrl}
            >
              <MessageCircle className="h-5 w-5" />
              {joinMode === "company" ? "카카오로 직원 가입" : "카카오로 개인 시작"}
              <ChevronRight className="h-5 w-5" />
            </a>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <p className="font-black text-amber-950">카카오 OAuth 설정 필요</p>
                  <p className="mt-1 text-sm font-bold leading-6 text-amber-800">
                    Vercel 환경변수 `KAKAO_CLIENT_ID`, `KAKAO_REDIRECT_URI`를 등록하면 이 버튼이 실제 카카오 로그인으로 연결됩니다.
                  </p>
                </div>
              </div>
            </div>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
              <div>
                <p className="font-black text-slate-950">{joinMode === "company" ? "회사 권한은 초대 코드로 제한됩니다" : "나중에 회사 워크스페이스로 전환할 수 있습니다"}</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                  {joinMode === "company"
                    ? "카카오 계정만으로는 접근할 수 없고, 고객사 관리자가 발급한 초대 링크가 있어야 회사 데이터에 연결됩니다."
                    : "개인으로 먼저 시작한 뒤 고객사 관리자 초대를 받으면 회사 직원 또는 관리자로 연결할 수 있습니다."}
                </p>
              </div>
            </div>
          </section>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-4">
          <Link className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700" href="/dashboard/login">
            <Smartphone className="h-4 w-4" />
            고객사 로그인으로 돌아가기
          </Link>
        </footer>
      </section>
    </main>
  );
}

function MobileBenefit({ description, icon: Icon, title }: { description: string; icon: typeof Truck; title: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="font-black text-slate-950">{title}</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function createKakaoLoginUrl(inviteCode: string) {
  const clientId = process.env.KAKAO_CLIENT_ID;
  const redirectUri = process.env.KAKAO_REDIRECT_URI;
  if (!clientId || !redirectUri) return "";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state: inviteCode || "personal"
  });

  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}
