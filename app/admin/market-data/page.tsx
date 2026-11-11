import { redirect } from "next/navigation";
import { AdminMarketPriceTable } from "@/components/admin-readonly-tables";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";
import { AdminPageHeader } from "../admin-page-header";
import { readKamisPrices, readTourEvents } from "./market-api";

const categories = { "200": "채소류", "400": "과일류", "600": "수산물" } as const;

export default async function AdminMarketDataPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const requested = (await searchParams).category;
  const category = requested && Object.hasOwn(categories, requested) ? requested as keyof typeof categories : "200";
  const [prices, events] = await Promise.all([readKamisPrices(category), readTourEvents()]);

  return <main className="min-h-screen maju-app-bg">
    <AdminPageHeader active="system" badge="공공 자료" session={session} title="시장·행사 참고 정보" subtitle="공식 자료의 조사일과 출처를 확인합니다. 주문 가격에는 자동 반영되지 않습니다." />
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <Card><CardHeader><CardTitle>시장 참고 가격 · KAMIS</CardTitle></CardHeader><CardContent className="space-y-3">
        <form method="get"><label className="flex flex-wrap items-center gap-2 text-sm">품목 부류
          <select className="min-h-11 rounded border bg-white px-3" name="category" defaultValue={category}>
            {Object.entries(categories).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select></label><button className="mt-2 min-h-11 rounded border px-4 text-sm" type="submit">조회</button></form>
        <p role="status" className="text-sm text-slate-600">{prices.message}</p>
        {prices.items.length > 0 && <AdminMarketPriceTable rows={prices.items.map((item, index) => ({ key: `${item.name}-${item.variety}-${index}`, name: item.name, varietyGrade: `${item.variety} ${item.grade}`.trim(), unit: item.unit, price: item.price, date: item.date }))} />}
        <a className="text-sm text-teal-700 underline" href="https://www.kamis.or.kr/customer/reference/openapi_list.do" rel="noreferrer" target="_blank">KAMIS 자료·이용 조건 확인</a>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>전국 행사 표본 · 한국관광공사</CardTitle></CardHeader><CardContent className="space-y-3">
        <p role="status" className="text-sm text-slate-600">{events.message}</p>
        {events.items.length > 0 && <ul className="space-y-2">{events.items.map((item) => <li className="rounded border p-3 text-sm" key={item.id}><strong>{item.title}</strong><span className="block text-slate-600">{item.from}–{item.to} · {item.address || "장소 미제공"}</span></li>)}</ul>}
        <a className="text-sm text-teal-700 underline" href="https://www.data.go.kr/data/15101578/openapi.do" rel="noreferrer" target="_blank">관광공사 자료·이용 조건 확인</a>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>다음 연결 후보</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-3">
        <p><strong>소진공 상가정보</strong><span className="block text-slate-600">영업 지역의 동업종 점포 수를 표본 조회한 뒤 기존 리드와 중복 여부를 점검합니다.</span></p>
        <p><strong>에어코리아</strong><span className="block text-slate-600">측정소·시각을 포함한 대기질 참고값부터 검증합니다.</span></p>
        <p><strong>기상청 예보</strong><span className="block text-slate-600">행사·배송 일정 참고용으로만 검토합니다.</span></p>
      </CardContent></Card>
      <p className="text-xs text-slate-500">공식 자료는 조사 지역·단위·갱신 시각이 회사 거래 조건과 다를 수 있습니다. 판매가, 마진, 주문 수량을 자동 변경하지 않습니다.</p>
    </div>
  </main>;
}

