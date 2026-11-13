import { redirect } from "next/navigation";

// CC-32a: 옛 "판매가"(마진 설정) 주소 → 기본 카탈로그 화면.
export default async function MarginsMovedPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const companyId = (await searchParams)?.companyId;
  redirect(companyId ? `/revenue/pricing/catalog?companyId=${encodeURIComponent(companyId)}` : "/revenue/pricing/catalog");
}
