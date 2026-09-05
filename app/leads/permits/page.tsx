import { redirect } from "next/navigation";

// 신규 리드는 더 이상 별도 페이지가 아니라 지도 홈(/dashboard) 안의 "신규 리드" 탭입니다.
// 예전 북마크나 딥링크로 이 경로에 들어와도 같은 화면(탭)으로 보내줍니다.
export default async function LegacyPermitLeadsRedirectPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const companyId = resolvedSearchParams?.companyId;
  redirect(companyId ? `/dashboard?companyId=${encodeURIComponent(companyId)}&view=leads` : "/dashboard?view=leads");
}
