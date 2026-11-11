import Link from "next/link";
import type { StorePortalAccount } from "@/lib/store/07-store-portal";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { storeDirectSignupEnabled } from "@/lib/store/11-store-direct-signup";
import { StoreDirectSignup } from "./store-direct-signup";

export function StorePortal({ accounts, error = false, fixture, loginEnabled }: { accounts: StorePortalAccount[] | null; error?: boolean; fixture?: string; loginEnabled: boolean }) {
  const directSignup = storeDirectSignupEnabled() || Boolean(fixture); // fixture는 CI 전용(page.tsx가 CI 픽스처 모드에서만 넘긴다)
  return <section className="space-y-4" aria-label="매장 홈">
    <div><h1 className="text-xl font-semibold sm:hidden">MAJU 매장</h1><p className="text-sm text-slate-600">받은 견적서·단가표를 확인하고 주문과 원가관리를 이어가세요.</p></div>
    {error ? <Card><CardContent className="space-y-2 pt-4"><p role="alert">매장 정보를 불러오지 못했습니다.</p><Link className="inline-flex min-h-[44px] items-center underline" href="/store">다시 시도</Link></CardContent></Card> : accounts === null ? <Card><CardHeader><CardTitle>카카오로 시작</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-sm text-slate-600">{directSignup ? "카카오로 시작하세요. 처음이면 매장 정보를 입력하고 바로 시작할 수 있어요." : "이미 가입한 점주·직원은 카카오로 로그인하세요. 첫 가입은 받은 견적서·단가표 링크에서 진행합니다."}</p>
      {loginEnabled ? <Link className="maju-button-primary inline-flex min-h-[44px] items-center justify-center px-4" href="/api/auth/kakao/start?storePortal=1">{directSignup ? "카카오로 시작" : "카카오로 로그인"}</Link> : <p role="status" className="text-sm">매장 로그인이 준비 중입니다. 받은 문서 링크를 이용해 주세요.</p>}
    </CardContent></Card> : accounts.length === 0 && directSignup ? <StoreDirectSignup fixture={fixture} /> : accounts.length === 0 ? <Card><CardContent className="space-y-2 pt-4">
      <p role="status">이 계정에 연결된 매장이 없습니다.</p><p className="text-sm text-slate-600">받은 견적서·단가표 링크에서 매장 가입을 완료하거나 점주에게 구성원 초대를 요청해 주세요.</p>
    </CardContent></Card> : accounts.map(account => {
      const scope = new URLSearchParams({ companyId: account.companyId, storeAccountId: account.storeAccountId });
      return <Card key={`${account.companyId}:${account.storeAccountId}`}><CardHeader><CardTitle>{account.customerName}</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {account.hasCostAccess && <Link className="maju-button-primary inline-flex min-h-[44px] items-center justify-center px-4" href={`/store?${scope}`}>원가관리</Link>}
          {account.canManageAddress && <Link className="inline-flex min-h-[44px] items-center rounded-lg border px-4" href={`/store?${scope}#store-address-management`}>배송지 주소</Link>}
          {account.canManageMembers && <Link className="inline-flex min-h-[44px] items-center rounded-lg border px-4" href={`/store/members?${scope}`}>구성원</Link>}
        </div>
        <div><h2 className="font-semibold">견적서·단가표와 주문</h2>
          {account.documents.length ? <ul className="mt-2 space-y-2">{account.documents.map(document => <li key={document.href}>
            <Link className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 rounded-lg border p-3 underline" href={document.href}>
              <span>{document.kind === "quote" ? "견적서" : "단가표"} · {document.title}</span>
              <span className="text-sm">{document.canOrder ? "문서 확인·주문" : "문서 확인"}</span>
            </Link>
          </li>)}</ul> : <p role="status" className="mt-2 text-sm text-slate-600">연결된 문서가 없습니다. 유통사에서 받은 공개 링크를 열거나 담당자에게 문서 공유를 요청해 주세요.</p>}
        </div>
      </CardContent></Card>;
    })}
  </section>;
}
