"use client";

import Link from "next/link";
import { BarChart3, ClipboardList, HeartPulse, MapPin, Route, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalysisResult } from "@/lib/analysis";
import { UploadTemplateType } from "@/lib/sample-data";

// Split out of app/page.tsx so the report screen is loaded only after analysis
// finishes instead of being included in the initial data registration bundle.
export function Report({
  analysis,
  dashboardHref,
  ledgerHref,
  meta,
  mobileHref,
  onReset,
  routeHref,
  uploadType
}: {
  analysis: AnalysisResult;
  dashboardHref: string;
  ledgerHref: string;
  meta: { rows: number; qualityScore: number; persisted: boolean };
  mobileHref: string;
  onReset: () => void;
  routeHref: string;
  uploadType: UploadTemplateType;
}) {
  const scoreRows = [
    ["영업력", analysis.health.salesPower],
    ["배송효율", analysis.health.deliveryEfficiency],
    ["CRM관리", analysis.health.crmManagement],
    ["신규영업", analysis.health.newSales],
    ["거래처 집중도", analysis.health.concentration],
    ["리스크", analysis.health.risk]
  ];
  const isSalesReport = uploadType === "sales-analysis";
  const sortedWhiteSpace = analysis.regionDistribution
    .slice()
    .sort((a, b) => b.whitespace - a.whitespace)
    .slice(0, 4);
  const actionPlan = [
    ["오늘", "A등급 거래처 주소와 사업자 상태를 먼저 보완하고, 배송 적재위치 자료를 등록합니다."],
    ["이번주", `${analysis.missingRegions.slice(0, 3).join(", ")} 지역의 신규 매장 후보를 영업 코스에 넣습니다.`],
    ["이번달", "매출 거래원장을 다시 업로드해 품목 이탈과 매출 등급 변화를 비교합니다."]
  ] as const;

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge className="mb-4 bg-blue-50 text-blue-700">MAJU AI Report</Badge>
              <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">{analysis.companyName} 회사 진단 리포트</h1>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                {isSalesReport ? "매출 거래내역 업데이트" : "거래처 마스터 등록"} 기준 · 거래처 {analysis.customers}곳 · 거래지역 {analysis.regions}개 · 분석 완료
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-black text-white shadow-sm transition hover:bg-teal-800" href={dashboardHref}>
                대시보드 보기
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                href={ledgerHref}
              >
                {isSalesReport ? "매출 원장 보기" : "거래처 히스토리 보기"}
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                href={routeHref}
              >
                지도 홈 보기
              </Link>
              <Button variant="outline" onClick={onReset}>데이터 다시 등록</Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <ResultMetric label="처리 데이터" value={`${meta.rows.toLocaleString()}행`} />
            <ResultMetric label="저장 상태" value={meta.persisted ? "DB 저장" : "저장 확인 필요"} />
            <ResultMetric label="품질 점수" value={meta.qualityScore ? `${meta.qualityScore}%` : "확인 필요"} />
            <ResultMetric label="잠재매출" value={`월 ${analysis.potentialRevenue.toLocaleString()}만원`} />
          </div>
          <ReportDataBasisCard
            dashboardHref={dashboardHref}
            isSalesReport={isSalesReport}
            ledgerHref={ledgerHref}
            mobileHref={mobileHref}
            persisted={meta.persisted}
            qualityScore={meta.qualityScore}
            routeHref={routeHref}
            rows={meta.rows}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-500">Company Health Score</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-6xl font-black text-teal-700">{analysis.health.total}</span>
                <span className="pb-2 text-sm font-black text-slate-500">점</span>
              </div>
            </div>
            <HeartPulse className="h-6 w-6 text-teal-700" />
          </div>
          <div className="mt-5 space-y-3">
            {scoreRows.map(([label, value]) => (
              <div key={label as string}>
                <div className="mb-1 flex justify-between text-xs font-bold text-slate-500">
                  <span>{label as string}</span>
                  <span>{value as number}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-teal-600" style={{ width: `${value as number}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="grid gap-4 lg:grid-cols-2">
          <ReportSection icon={MapPin} title="거래처 분포">
            {analysis.regionDistribution.slice(0, 6).map((item) => (
              <MetricLine key={item.region} label={item.region} value={`${item.count}곳`} hint={`잠재 ${item.potential}곳 · 공백 ${item.whitespace}곳`} />
            ))}
          </ReportSection>

          <ReportSection icon={Route} title="배송 운영">
            <div className="grid gap-3 sm:grid-cols-2">
              <ResultMetric label="평균 배송거리" value={`${analysis.avgDeliveryKm.toFixed(1)}km`} />
              <ResultMetric label="절감 가능거리" value={`${Math.max(18, Math.round(analysis.avgDeliveryKm * 2.8))}km`} />
            </div>
            <p className="mt-4 text-sm font-semibold leading-6 text-slate-500">
              물류 출발지와 배송주소를 기준으로 권역을 묶으면 같은 차량의 중복 이동을 줄일 수 있습니다.
            </p>
          </ReportSection>

          <ReportSection icon={BarChart3} title="업종 · 매출 구조">
            {analysis.industryDistribution.map((item) => (
              <MetricLine key={item.industry} label={item.industry} value={`${item.share}%`} hint={`${item.count}곳 · 매출 등급 산정 기준`} />
            ))}
          </ReportSection>

          <ReportSection icon={Target} title="White Space">
            {sortedWhiteSpace.map((item) => (
              <MetricLine key={item.region} label={item.region} value={`${item.whitespace}곳`} hint={`현재 거래처 ${item.count}곳`} />
            ))}
          </ReportSection>
        </div>

        <div className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI 제안 요약
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.aiInsights.map((insight) => (
                <div key={insight} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-700">
                  {insight}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                다음 액션
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {actionPlan.map(([period, action]) => (
                <div key={period} className="grid gap-3 rounded-md border border-slate-100 p-3 sm:grid-cols-[72px_1fr]">
                  <Badge className="h-fit justify-center bg-blue-50 text-blue-700">{period}</Badge>
                  <p className="text-sm font-semibold leading-6 text-slate-600">{action}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            추천 TOP10
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {analysis.leadRecommendations.map((lead, index) => (
            <div key={lead.name} className="grid gap-3 rounded-md border border-slate-100 bg-white p-3 sm:grid-cols-[48px_1fr_auto] sm:items-center">
              <span className="text-lg font-black text-blue-700">{index + 1}위</span>
              <div>
                <p className="font-black text-slate-950">{lead.name}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{lead.reasons.join(" · ")}</p>
              </div>
              <Badge className="justify-center bg-emerald-50 text-emerald-700">{lead.score}점</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function ReportDataBasisCard({
  dashboardHref,
  isSalesReport,
  ledgerHref,
  mobileHref,
  persisted,
  qualityScore,
  routeHref,
  rows
}: {
  dashboardHref: string;
  isSalesReport: boolean;
  ledgerHref: string;
  mobileHref: string;
  persisted: boolean;
  qualityScore: number;
  routeHref: string;
  rows: number;
}) {
  const sourceLabel = isSalesReport ? "매출 거래내역" : "거래처 마스터";
  const basisRows = [
    {
      label: "리포트 기준 데이터",
      value: sourceLabel,
      description: isSalesReport ? "ERP 거래원장 매출 행을 거래처별로 묶어 등급과 이탈 징후를 계산합니다." : "사업자번호, 배송주소, 업종, 거래처 정보를 기준으로 회사 상태를 계산합니다."
    },
    {
      label: "반영 화면",
      value: isSalesReport ? "매출 원장 · AI 리포트" : "거래처 히스토리 · 배송 코스",
      description: isSalesReport ? "저장 후 매출 원장과 대시보드 수치가 같은 기준으로 갱신됩니다." : "저장 후 거래처 상세, 지도 마커, 배송차별 코스에서 같은 기준값을 사용합니다."
    },
    {
      label: "운영 신뢰도",
      value: persisted ? "DB 저장 확인" : "저장 확인 필요",
      description: persisted ? `${rows.toLocaleString()}행 처리 · 품질 ${qualityScore || 0}% 기준으로 리포트를 생성했습니다.` : "분석 미리보기는 가능하지만 DB 저장 상태를 먼저 확인해야 DB 반영 데이터로 볼 수 있습니다."
    }
  ];
  const checkLinks = [
    {
      description: "대표가 보는 KPI와 Health Score가 DB 저장값 기준으로 갱신됐는지 확인합니다.",
      href: dashboardHref,
      label: "대시보드",
      value: "KPI 확인"
    },
    {
      description: isSalesReport ? "거래원장 행이 매출 분석 화면에 누적됐는지 확인합니다." : "사업자번호, 주소, 담당자, 첨부자료가 원장에 반영됐는지 확인합니다.",
      href: ledgerHref,
      label: isSalesReport ? "매출 원장" : "거래처 히스토리",
      value: isSalesReport ? "매출 확인" : "원장 확인"
    },
    {
      description: "거래처 주소와 담당자 배정값이 지도와 배송차 코스에 이어졌는지 확인합니다.",
      href: routeHref,
      label: "지도 홈",
      value: "코스 확인"
    },
    {
      description: "현장 직원 모바일 화면에서 오늘 코스와 거래처 액션이 보이는지 확인합니다.",
      href: mobileHref,
      label: "모바일 현장",
      value: "현장 확인"
    }
  ];

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black text-blue-950">리포트 데이터 기준</p>
          <p className="mt-1 text-xs font-bold leading-5 text-blue-800">대표가 보는 점수는 등록된 데이터 종류와 DB 저장 상태를 기준으로 해석해야 합니다.</p>
        </div>
        <Badge className={persisted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
          {persisted ? "운영 반영 가능" : "저장 확인 필요"}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {basisRows.map((row) => (
          <div className="rounded-md border border-white/80 bg-white p-3" key={row.label}>
            <p className="text-[11px] font-black text-slate-400">{row.label}</p>
            <p className="mt-1 text-sm font-black text-slate-950">{row.value}</p>
            <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{row.description}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-white/80 bg-white/80 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-slate-950">저장 후 반영 확인 순서</p>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">저장 완료 후 아래 4개 화면이 같은 회사와 같은 DB 기준으로 보이면 반영이 완료된 상태입니다.</p>
          </div>
          <Badge className={persisted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
            {persisted ? "확인 가능" : "저장 확인 후"}
          </Badge>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-4">
          {checkLinks.map((item) => (
            <Link className="rounded-md border border-slate-200 bg-white p-3 transition hover:border-teal-200 hover:bg-teal-50/60" href={item.href} key={item.label}>
              <span className="block text-[11px] font-black text-slate-400">{item.label}</span>
              <span className="mt-1 block text-sm font-black text-slate-950">{item.value}</span>
              <span className="mt-2 block text-xs font-bold leading-5 text-slate-500">{item.description}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportSection({ icon: Icon, title, children }: { icon: typeof MapPin; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/70 p-4">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function MetricLine({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <div>
        <p className="font-bold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <span className="text-lg font-black">{value}</span>
    </div>
  );
}
