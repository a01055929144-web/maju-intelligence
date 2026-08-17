import Link from "next/link";

type OAuthLoginButtonsProps = {
  inviteCode?: string;
};

// 네이버/카카오/구글 로그인 버튼을 한 곳에서 관리합니다. /dashboard/login과 /mobile/join이
// 이 컴포넌트를 함께 써서 두 화면의 버튼 문구·스타일이 벌어지지 않도록 합니다.
// "계속하기" 문구는 최초 로그인이면 자동으로 개인 워크스페이스를 만들고, 이미 초대를 수락한
// 계정이면 그 회사로 연결하는 백엔드 동작(가입/로그인 겸용)과 그대로 맞아떨어집니다.
export function OAuthLoginButtons({ inviteCode }: OAuthLoginButtonsProps) {
  const query = inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : "";

  return (
    <div className="flex flex-col gap-2.5">
      <Link
        className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-4 py-3 text-sm font-black text-[#191919] shadow-[0_10px_24px_rgba(250,204,21,0.20)] transition hover:brightness-95"
        href={`/api/auth/kakao/start${query}`}
      >
        <KakaoMark />
        카카오로 계속하기
      </Link>
      <Link
        className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#03C75A] px-4 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(3,199,90,0.20)] transition hover:brightness-95"
        href={`/api/auth/naver/start${query}`}
      >
        <NaverMark />
        네이버로 계속하기
      </Link>
      <Link
        className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition hover:bg-slate-50"
        href={`/api/auth/google/start${query}`}
      >
        <GoogleMark />
        구글 이메일로 계속하기
      </Link>
    </div>
  );
}

function KakaoMark() {
  return (
    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#191919] text-[9px] font-black leading-none text-[#FEE500]">K</span>
  );
}

function NaverMark() {
  return <span className="grid h-4 w-4 shrink-0 place-items-center rounded-[4px] bg-white text-[10px] font-black leading-none text-[#03C75A]">N</span>;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z"
        fill="#4285F4"
      />
      <path
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11C3.24 21.3 7.28 24 12 24Z"
        fill="#34A853"
      />
      <path d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.26a12 12 0 0 0 0 10.76l4.01-3.11Z" fill="#FBBC05" />
      <path
        d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.28 0 3.24 2.7 1.26 6.62l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
        fill="#EA4335"
      />
    </svg>
  );
}
