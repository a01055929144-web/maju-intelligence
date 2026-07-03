"use client";

import { useMemo, useState } from "react";
import { Database, KeyRound, MapPin, Phone, RefreshCw, Search, Sheet, X } from "lucide-react";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { RoutePlan, RoutePlanStop } from "@/lib/store";

type RevenueGrade = "A" | "B" | "C";
type GradeFilter = "all" | RevenueGrade;

type LeadStore = {
  id: string;
  name: string;
  address: string;
  phone: string;
  grade: RevenueGrade;
  item: string;
  erp: string;
  source: string;
  revenue: number;
  elapsedDays: number;
  meetings: number;
  memo: string;
  x: number;
  y: number;
};

type B2BLeadMapWorkspaceProps = {
  readonly mapMarkers: KakaoMapMarker[];
  readonly routePlan: RoutePlan;
};

const gradeFilters: Array<{ label: string; value: GradeFilter }> = [
  { label: "전체", value: "all" },
  { label: "A등급", value: "A" },
  { label: "B등급", value: "B" },
  { label: "C등급", value: "C" }
];

const leadSeeds = [
  ["성원식자재마트", "경기 양주시 평화로1261번길 74-2 1동", "010-9390-6737 010-8215-6737", "한식", "경영박사", "레퍼럴"],
  ["(주)JK푸드", "경기 남양주시 와부읍 수레로261번길 11", "010-8418-8486", "급식", "얼마에요", "오프라인"],
  ["애자일(이지키친)", "경기 하남시 하남대로166번길 42-12", "010-2088-1200", "한식", "푸드ERP", "지도검색"],
  ["미투웨이브", "서울 성동구 성수일로10가길 64-3, 1층", "010-4312-5907", "카페", "엑셀", "콜드콜"],
  ["원흥축산", "경기 고양시 덕양구 도래울1로 57", "010-3344-0863", "축산", "더존", "레퍼럴"],
  ["(주)쎄븐", "경기 용인시 기흥구 동탄기흥로 748", "010-3230-0857", "일식", "경영박사", "박람회"],
  ["주석화금산프레시미트", "경기 광주시 초월읍 도평길110번길 108", "010-4895-7645", "한식", "얼마에요", "오프라인"],
  ["에나에프에스", "경기 남양주시 진건읍 독정로숲숲길 23-24", "010-8864-9592", "분식", "엑셀", "지도검색"],
  ["청담반상", "서울 강남구 도산대로 145", "010-2217-1022", "한식", "더존", "콜드콜"],
  ["성수온반", "서울 성동구 연무장길 76", "010-7782-1201", "한식", "경영박사", "레퍼럴"],
  ["마포찬방", "서울 마포구 월드컵로 45", "010-6122-1899", "반찬", "푸드ERP", "오프라인"],
  ["위례키친", "경기 성남시 수정구 위례광장로 300", "010-4418-0901", "한식", "더존", "지도검색"],
  ["송파정육식당", "서울 송파구 송파대로 345", "010-7531-9311", "한식", "엑셀", "콜드콜"],
  ["하남가든", "경기 하남시 미사강변대로 200", "010-3112-7740", "한식", "경영박사", "레퍼럴"],
  ["광진한상", "서울 광진구 능동로 92", "010-5233-7601", "한식", "얼마에요", "오프라인"],
  ["덕양푸드랩", "경기 고양시 덕양구 화중로 104", "010-6811-4230", "급식", "더존", "지도검색"],
  ["일산브런치랩", "경기 고양시 일산동구 중앙로 1275", "010-4198-7222", "카페", "엑셀", "콜드콜"],
  ["분당한정식", "경기 성남시 분당구 황새울로 360", "010-2884-6461", "한식", "경영박사", "레퍼럴"],
  ["구리찬마루", "경기 구리시 경춘로 239", "010-9482-5018", "한식", "푸드ERP", "지도검색"],
  ["별내푸드", "경기 남양주시 별내중앙로 26", "010-7142-0149", "분식", "더존", "오프라인"]
] as const;

export function B2BLeadMapWorkspace({ mapMarkers, routePlan }: B2BLeadMapWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [selectedId, setSelectedId] = useState<string>("");
  const leads = useMemo(() => createLeadStores(routePlan.groups.flatMap((group) => group.stops)), [routePlan]);
  const visibleLeads = useMemo(
    () =>
      leads.filter((lead) => {
        const matchesGrade = gradeFilter === "all" || lead.grade === gradeFilter;
        const keyword = query.trim().toLowerCase();
        const matchesQuery = !keyword || `${lead.name} ${lead.address} ${lead.phone} ${lead.item}`.toLowerCase().includes(keyword);
        return matchesGrade && matchesQuery;
      }),
    [gradeFilter, leads, query]
  );
  const selectedLead = visibleLeads.find((lead) => lead.id === selectedId) || visibleLeads[0] || leads[0];
  const markers = useMemo(() => createMapMarkers(mapMarkers, visibleLeads), [mapMarkers, visibleLeads]);
  const stats = useMemo(() => createStats(leads), [leads]);

  return (
    <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
      <header className="flex flex-col gap-4 border-b border-slate-800 bg-slate-900 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <h2 className="whitespace-nowrap text-lg font-black">B2B 유통사 리드 관리</h2>
          <nav className="hidden items-center gap-2 md:flex">
            {["오늘 할 일", "유통사 목록", "지도"].map((item) => (
              <button
                className={`h-9 rounded-md px-4 text-sm font-black transition ${item === "지도" ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
                key={item}
                type="button"
              >
                {item}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="h-9 rounded-md border border-slate-700 px-3 text-sm font-black text-white hover:bg-slate-800" type="button">
            서비스 수수료
          </button>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-black text-white hover:bg-slate-800" type="button">
            <Sheet className="h-4 w-4" />
            Google Sheet
          </button>
          <button className="h-9 rounded-md border border-slate-700 px-3 text-sm font-black text-white hover:bg-slate-800" type="button">
            다크
          </button>
          <span className="text-xs font-bold text-slate-500">업데이트: 오전 09:10</span>
          <button className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 text-slate-400 hover:bg-slate-800" type="button">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 border-b border-blue-600/80 bg-slate-900 md:grid-cols-6">
        <Kpi label="전체" value={stats.total.toLocaleString()} tone="blue" />
        <Kpi label="A등급" value={stats.aGrade.toLocaleString()} tone="green" />
        <Kpi label="액션필요" value="0" tone="red" />
        <Kpi label="주문독계약" value="17" tone="blue" />
        <Kpi label="매칭완료" value="56" tone="green" />
        <Kpi label="거래성사" value="9" tone="purple" />
      </section>

      <section className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950 px-5 py-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-800 pl-9 pr-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름·주소·연락처 검색..."
            value={query}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {gradeFilters.map((filter) => (
            <button
              className={`h-10 rounded-md border px-4 text-sm font-black transition ${
                gradeFilter === filter.value ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
              key={filter.value}
              onClick={() => setGradeFilter(filter.value)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
          <button className="h-10 rounded-md border border-slate-700 bg-slate-800 px-4 text-sm font-black text-white hover:bg-slate-700" type="button">
            이탈 제외
          </button>
          <button className="h-10 rounded-md border border-slate-700 bg-slate-800 px-4 text-sm font-black text-white hover:bg-slate-700" type="button">
            내 위치
          </button>
          <span className="ml-2 text-sm font-black text-slate-400">{visibleLeads.length}개</span>
        </div>
      </section>

      <section className="grid min-h-[760px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px_400px]">
        <div className="min-w-0 bg-slate-100">
          <KakaoAddressMap mapClassName="h-[760px] min-h-[680px] rounded-none border-0 xl:h-[calc(100vh-292px)]" markers={markers} showList={false} />
        </div>

        <aside className="border-l border-slate-800 bg-slate-950">
          <div className="border-b border-slate-800 px-4 py-4">
            <p className="text-sm font-black text-white">📍 유통사 목록</p>
            <p className="mt-1 text-xs font-bold text-slate-500">매출 등급과 주소 기반으로 정렬됩니다.</p>
          </div>
          <div className="max-h-[720px] overflow-auto xl:max-h-[calc(100vh-365px)]">
            {visibleLeads.map((lead) => (
              <button
                className={`block w-full border-b border-slate-800 px-4 py-4 text-left transition hover:bg-slate-900 ${
                  lead.id === selectedLead?.id ? "bg-blue-950/70 shadow-[inset_3px_0_0_#3b82f6]" : ""
                }`}
                key={lead.id}
                onClick={() => setSelectedId(lead.id)}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-black text-white">{lead.name}</p>
                  <span className={gradeBadgeClass(lead.grade)}>{lead.grade}등급</span>
                </div>
                <p className="mt-1 truncate text-xs font-bold text-slate-400">{lead.address}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{lead.phone}</p>
              </button>
            ))}
          </div>
        </aside>

        <aside className="border-l border-slate-800 bg-slate-900">
          {selectedLead ? <LeadDetail lead={selectedLead} /> : null}
        </aside>
      </section>
    </div>
  );
}

function Kpi({ label, tone, value }: { readonly label: string; readonly tone: "blue" | "green" | "purple" | "red"; readonly value: string }) {
  const valueClass = {
    blue: "text-blue-400",
    green: "text-emerald-400",
    purple: "text-violet-400",
    red: "text-rose-400"
  }[tone];

  return (
    <div className="border-r border-slate-800 px-5 py-3 last:border-r-0">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

function LeadDetail({ lead }: { readonly lead: LeadStore }) {
  return (
    <div className="max-h-[760px] overflow-auto xl:max-h-[calc(100vh-292px)]">
      <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-5">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-black text-white">{lead.name}</h3>
          <p className="mt-1 text-xs font-bold text-slate-400">
            {lead.grade}등급 · {lead.phone} · 경과 {lead.elapsedDays}일 · 미팅 {lead.meetings}회
          </p>
          <button className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-black text-white hover:bg-blue-500" type="button">
            <KeyRound className="h-4 w-4" />
            편집 로그인
          </button>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-md bg-slate-800 text-slate-400 hover:text-white" type="button">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-7 px-5 py-5">
        <PanelTitle title="기본 정보" />
        <InfoRow icon={<Phone className="h-4 w-4" />} label="연락처" value={lead.phone} />
        <InfoRow icon={<MapPin className="h-4 w-4" />} label="주소" value={lead.address} />
        <InfoRow label="취급품목" value={lead.item} />
        <InfoRow label="ERP" value={lead.erp} />
        <InfoRow label="리드소스" value={lead.source} />
        <label className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-3 text-sm">
          <span className="font-bold text-slate-500">ICP등급</span>
          <select className="h-9 rounded-md border border-slate-700 bg-slate-950 px-3 font-black text-white" defaultValue={lead.grade}>
            <option>A등급</option>
            <option>B등급</option>
            <option>C등급</option>
          </select>
        </label>

        <PanelTitle title="액션 현황" />
        <Field label="최근진행일" type="date" value="2025-07-18" />
        <Field label="다음액션일" type="date" />
        <label className="grid gap-2 text-sm">
          <span className="font-bold text-slate-500">내용</span>
          <textarea className="min-h-24 rounded-md border border-slate-700 bg-slate-950 p-3 font-bold text-white outline-none" defaultValue={lead.memo} />
        </label>

        <PanelTitle title="비즈니스 현황" />
        <div className="rounded-md border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-sm font-black text-white">
              <Database className="h-4 w-4 text-blue-400" />
              주문톡 SaaS
            </p>
            <select className="h-8 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs font-black text-white" defaultValue="demo">
              <option value="demo">데모완료</option>
              <option value="meeting">미팅예정</option>
              <option value="won">계약완료</option>
            </select>
          </div>
          <Field label="진행일" type="date" value="2025-07-19" compact />
          <label className="mt-3 grid gap-2 text-sm">
            <span className="font-bold text-slate-500">메모</span>
            <textarea className="min-h-20 rounded-md border border-slate-700 bg-slate-900 p-3 font-bold text-white outline-none" defaultValue="0319 오프라인 세일즈. 유통사 참고가 아닌 납기 기준 창고로 되어 있음" />
          </label>
        </div>
      </div>
    </div>
  );
}

function PanelTitle({ title }: { readonly title: string }) {
  return <p className="border-b border-slate-800 pb-2 text-xs font-black text-slate-500">{title}</p>;
}

function InfoRow({ icon, label, value }: { readonly icon?: React.ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 text-sm">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2 font-black text-white">
        {icon}
        <span className="min-w-0 break-words">{value}</span>
      </span>
    </div>
  );
}

function Field({ compact = false, label, type, value }: { readonly compact?: boolean; readonly label: string; readonly type: string; readonly value?: string }) {
  return (
    <label className={`${compact ? "mt-3" : ""} grid grid-cols-[86px_minmax(0,1fr)] items-center gap-3 text-sm`}>
      <span className="font-bold text-slate-500">{label}</span>
      <input className="h-9 rounded-md border border-slate-700 bg-slate-950 px-3 font-bold text-white outline-none" defaultValue={value} type={type} />
    </label>
  );
}

function createLeadStores(stops: RoutePlanStop[]) {
  const base = leadSeeds.map((seed, index) => createLeadFromSeed(seed, index, stops[index]));
  const extra = Array.from({ length: 60 }, (_, index) => {
    const seed = leadSeeds[index % leadSeeds.length];
    return createLeadFromSeed(seed, index + leadSeeds.length, stops[(index + leadSeeds.length) % Math.max(stops.length, 1)]);
  });

  return [...base, ...extra];
}

function createLeadFromSeed(seed: (typeof leadSeeds)[number], index: number, stop?: RoutePlanStop): LeadStore {
  const revenue = stop?.expectedRevenue || 130 + ((index * 37) % 260);
  const grade = getRevenueGrade(revenue);
  const suffix = index < leadSeeds.length ? "" : ` ${String(index + 1).padStart(2, "0")}`;

  return {
    id: `lead-${index}`,
    name: `${seed[0]}${suffix}`,
    address: stop?.address || seed[1],
    phone: seed[2],
    grade,
    item: seed[3],
    erp: seed[4],
    source: seed[5],
    revenue,
    elapsedDays: 7 + ((index * 11) % 51),
    meetings: index % 4,
    memo: index % 3 === 0 ? "오프라인 세일즈. 유통사 참고가 아닌 납기 기준 창고 확인 필요" : "단가표와 납품 가능 요일 확인 후 재연락 예정",
    x: 18 + ((index * 9) % 68),
    y: 18 + ((index * 13) % 62)
  };
}

function getRevenueGrade(revenue: number): RevenueGrade {
  if (revenue >= 280) return "A";
  if (revenue >= 200) return "B";
  return "C";
}

function createMapMarkers(existingMarkers: KakaoMapMarker[], leads: LeadStore[]): KakaoMapMarker[] {
  const origin = existingMarkers.find((marker) => marker.tone === "origin");
  const leadMarkers = leads.map((lead) => ({
    address: lead.address,
    grade: lead.grade,
    label: lead.grade,
    name: lead.name,
    tone: "lead" as const,
    x: lead.x,
    y: lead.y
  }));

  return origin ? [origin, ...leadMarkers] : leadMarkers;
}

function createStats(leads: LeadStore[]) {
  return {
    total: 3714,
    aGrade: Math.max(63, leads.filter((lead) => lead.grade === "A").length)
  };
}

function gradeBadgeClass(grade: RevenueGrade) {
  if (grade === "A") return "rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-black text-emerald-300";
  if (grade === "B") return "rounded bg-blue-500/15 px-2 py-0.5 text-xs font-black text-blue-300";
  return "rounded bg-slate-500/20 px-2 py-0.5 text-xs font-black text-slate-300";
}
