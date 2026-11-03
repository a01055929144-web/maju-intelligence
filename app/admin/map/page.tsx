import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Building2, MapPinned, ShieldCheck, Store } from "lucide-react";
import { AdminPageHeader } from "../admin-page-header";
import { AdminAreaKakaoMap } from "@/components/admin-area-kakao-map";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildAdminMapOverview, type AdminMapCompanySnapshot, type AdminMapView } from "@/application/analytics/admin-map-overview";
import { getAdminSession } from "@/lib/auth";
import { isCiLayoutFixturesEnabled } from "@/lib/ci-layout-fixtures";
import { isAdminMapOverviewEnabled } from "@/lib/feature-modules";
import { KAKAO_INDUSTRY_BUCKETS } from "@/lib/industry-backfill";
import { getSelectableSalesAreaKeys, KOREAN_ADMINISTRATIVE_AREAS, KOREAN_PROVINCES } from "@/lib/korean-administrative-areas";
import { getCompanySalesAreaMapStats, getCompanySalesAreaState, getManagedCompanyAccounts } from "@/lib/store";

const viewLabels: Record<AdminMapView, string> = {
  territory: "영업권",
  sales: "영업 지역",
  customers: "거래처",
  leads: "리드 개방"
};

type SearchParams = { businessType?: string; companyId?: string; district?: string; industry?: string; province?: string; view?: string };

function mapHref(params: SearchParams) {
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return `/admin/map${query.size ? `?${query}` : ""}`;
}
export default async function AdminMapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const enabled = isAdminMapOverviewEnabled() || isCiLayoutFixturesEnabled();
  if (!enabled) {
    return (
      <main className="min-h-screen maju-app-bg">
        <AdminPageHeader active="map" badge="Admin Map" session={session} subtitle="회사별 집계만 표시하는 관리자 전용 현황판입니다" title="지도·현황" />
        <section className="mx-auto max-w-7xl px-4 py-6">
          <Card className="border-violet-200 bg-white shadow-none">
            <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center">
              <span className="rounded-xl bg-violet-100 p-3 text-violet-700"><ShieldCheck className="h-6 w-6" /></span>
              <div><h2 className="font-bold text-slate-950">서버 검증 전 비활성화</h2><p className="mt-1 text-sm leading-6 text-slate-600">회사별 집계와 관리자 권한 검증이 완료된 환경에서만 이 화면을 켭니다. 현재는 개별 매장 위치를 포함한 어떤 지도 데이터도 조회하지 않습니다.</p></div>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  const [params, payload] = await Promise.all([searchParams, getManagedCompanyAccounts()]);
  const province = KOREAN_PROVINCES.includes(params.province || "") ? params.province! : "서울특별시";
  const view = params.view && Object.prototype.hasOwnProperty.call(viewLabels, params.view) ? params.view as AdminMapView : "customers";
  const industry = KAKAO_INDUSTRY_BUCKETS.has(params.industry || "") ? params.industry! : "";
  const businessTypes = Array.from(new Set(payload.companies.map((company) => company.businessType).filter(Boolean))).sort();
  const businessType = businessTypes.includes(params.businessType || "") ? params.businessType! : "";
  const matchingCompanies = businessType ? payload.companies.filter((company) => company.businessType === businessType) : payload.companies;
  const selectedCompanies = params.companyId && matchingCompanies.some((company) => company.id === params.companyId)
    ? matchingCompanies.filter((company) => company.id === params.companyId)
    : matchingCompanies;
  const areas = getSelectableSalesAreaKeys(province);
  const district = areas.includes(params.district || "") ? params.district! : areas[0] || province;

  const snapshots: AdminMapCompanySnapshot[] = isCiLayoutFixturesEnabled()
    ? selectedCompanies.map((company, companyIndex) => ({
        companyId: company.id,
        companyName: company.name,
        areaState: { defaultAreas: areas.slice(companyIndex, companyIndex + 4), effectiveAreas: [], explicitAreas: areas.slice(companyIndex + 2, companyIndex + 6), source: "explicit", unrecognizedRegions: [] },
        stats: areas.map((administrativeArea, index) => ({ administrativeArea, customerCount: (index * 3 + 7) % 23, recentLeadCount: (index * 5 + 2) % 11, totalLeadCount: (index * 7 + 13) % 41 }))
      }))
    : await Promise.all(selectedCompanies.map(async (company) => ({
        companyId: company.id,
        companyName: company.name,
        areaState: await getCompanySalesAreaState(company.id),
        stats: await getCompanySalesAreaMapStats(company.id, province, industry)
      })));
  const overview = buildAdminMapOverview(snapshots, areas);
  const selectedArea = overview.areas.find((area) => area.administrativeArea === district) || overview.areas[0];
  const totals = overview.areas.reduce((value, area) => ({ customers: value.customers + area.customerCount, leads: value.leads + area.recentLeadCount }), { customers: 0, leads: 0 });
  const preserved = { businessType, companyId: params.companyId, district, industry, province, view };
  const districtHref = mapHref({ ...preserved, district: "" });

  return (
    <main className="min-h-screen maju-app-bg">
      <AdminPageHeader active="map" badge="Admin Map" session={session} subtitle="개별 매장 위치 없이 회사별 구 단위 집계만 확인합니다" title="지도·현황" />
      <section className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4" method="get">
          <FilterSelect label="고객사 구분" name="businessType" value={businessType}><option value="">전체 구분</option>{businessTypes.map((item) => <option key={item} value={item}>{item}</option>)}</FilterSelect>
          <FilterSelect label="고객사" name="companyId" value={params.companyId || ""}><option value="">전체 고객사</option>{matchingCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</FilterSelect>
          <FilterSelect label="시도" name="province" value={province}>{KOREAN_PROVINCES.map((item) => <option key={item} value={item}>{item}</option>)}</FilterSelect>
          <FilterSelect label="업종" name="industry" value={industry}><option value="">전체 업종</option>{Array.from(KAKAO_INDUSTRY_BUCKETS).map((item) => <option key={item} value={item}>{item}</option>)}</FilterSelect>
          <input name="view" type="hidden" value={view} />
          <button className="maju-button-primary md:col-span-2 md:justify-self-end xl:col-span-4" type="submit">필터 적용</button>
        </form>

        <nav aria-label="지도 보기" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(viewLabels) as AdminMapView[]).map((item) => <Link className={`rounded-xl border px-3 py-3 text-center text-sm font-bold ${item === view ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-violet-300"}`} href={mapHref({ ...preserved, view: item })} key={item}>{viewLabels[item]}</Link>)}
        </nav>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard icon={Building2} label="표시 고객사" value={selectedCompanies.length} />
          <SummaryCard icon={Store} label="거래처 합계" value={totals.customers} />
          <SummaryCard icon={BarChart3} label="최근 30일 리드" value={totals.leads} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPinned className="h-5 w-5 text-violet-600" />{province} 구 단위 {viewLabels[view]}</CardTitle></CardHeader>
            <CardContent className="overflow-hidden p-0">
              <AdminAreaKakaoMap district={district} hrefForDistrict={`${districtHref}${districtHref.includes("?") ? "&" : "?"}district=`} province={province} stats={overview.areas} view={view} />
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader><Badge className="w-fit bg-violet-100 text-violet-800">선택 지역</Badge><CardTitle className="text-xl">{selectedArea?.administrativeArea || province}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="영업권 회사" value={selectedArea?.territoryCount || 0} />
              <Detail label="영업 지역 회사" value={selectedArea?.salesCount || 0} />
              <Detail label="거래처" value={selectedArea?.customerCount || 0} />
              <Detail label="최근 리드" value={selectedArea?.recentLeadCount || 0} />
              <Detail className="col-span-2" label="전체 리드" value={selectedArea?.totalLeadCount || 0} />
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">{district} 회사별 집계</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="min-w-[720px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">고객사</th><th className="px-4 py-3">영업권</th><th className="px-4 py-3">영업 지역</th><th className="px-4 py-3 text-right">거래처</th><th className="px-4 py-3 text-right">최근 리드</th><th className="px-4 py-3 text-right">전체 리드</th></tr></thead><tbody>{overview.companies.map((company) => { const area = company.areas.find((item) => item.administrativeArea === district); return <tr className="border-t border-slate-100" key={company.companyId}><td className="px-4 py-3 font-bold text-slate-900">{company.companyName}</td><td className="px-4 py-3">{area?.territoryCovered ? "포함" : "-"}</td><td className="px-4 py-3">{area?.salesCovered ? "포함" : "-"}</td><td className="px-4 py-3 text-right">{area?.customerCount.toLocaleString() || 0}</td><td className="px-4 py-3 text-right">{area?.recentLeadCount.toLocaleString() || 0}</td><td className="px-4 py-3 text-right">{area?.totalLeadCount.toLocaleString() || 0}</td></tr>; })}</tbody></table>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function FilterSelect({ children, label, name, value }: { children: React.ReactNode; label: string; name: string; value: string }) {
  return <label className="text-xs font-bold text-slate-600"><span className="mb-1.5 block">{label}</span><select className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" defaultValue={value} name={name}>{children}</select></label>;
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: number }) {
  return <Card className="border-slate-200 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><span className="rounded-lg bg-violet-100 p-2 text-violet-700"><Icon className="h-5 w-5" /></span><div><p className="text-xs font-bold text-slate-500">{label}</p><p className="text-xl font-black text-slate-950">{value.toLocaleString()}</p></div></CardContent></Card>;
}

function Detail({ className = "", label, value }: { className?: string; label: string; value: number }) {
  return <div className={`rounded-lg bg-slate-50 p-3 ${className}`}><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-slate-950">{value.toLocaleString()}</p></div>;
}
