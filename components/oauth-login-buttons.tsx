"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useState } from "react";

type OAuthLoginButtonsProps = {
  inviteCode?: string;
};

// 소셜 로그인 버튼을 한 곳에서 관리합니다. /dashboard/login과 /mobile/join이 이 컴포넌트를
// 함께 써서 두 화면의 버튼 문구·스타일이 벌어지지 않도록 합니다.
// 네이버/구글은 콘솔 등록 절차가 부담스럽다는 판단에 따라 카카오만 노출합니다. 백엔드
// 라우트(app/api/auth/naver, app/api/auth/google)와 lib/store.ts의 공용 OAuth 함수는
// 나중에 다시 켤 수 있도록 그대로 남겨뒀습니다.
export function OAuthLoginButtons({ inviteCode }: OAuthLoginButtonsProps) {
  const query = inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : "";
  const [moving, setMoving] = useState(false);

  return (
    <Link
      aria-disabled={moving}
      aria-live="polite"
      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-4 py-3 text-sm font-semibold text-[#191919] shadow-[0_8px_20px_rgba(250,204,21,0.16)] transition ${moving ? "pointer-events-none opacity-70" : "hover:brightness-95"}`}
      href={`/api/auth/kakao/start${query}`}
      onClick={(event) => {
        if (moving) {
          event.preventDefault();
          return;
        }
        setMoving(true);
      }}
    >
      {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KakaoMark />}
      {moving ? "카카오 로그인 준비 중…" : "카카오로 계속"}
    </Link>
  );
}

function KakaoMark() {
  return (
    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#191919] text-[9px] font-black leading-none text-[#FEE500]">K</span>
  );
}
