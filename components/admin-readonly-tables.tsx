"use client";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";

// CC-12: 관리자 읽기 전용 표 3곳을 공용 표(열 편집·정렬·CSV·모바일 카드)로. 서버 페이지는 일반 데이터만 넘기고 열 정의는 여기서 한다.
export type DistrictRow = { id: string; name: string; territory: boolean; sales: boolean; customers: number; recentLeads: number; totalLeads: number };
export type MarketPriceRow = { key: string; name: string; varietyGrade: string; unit: string; price: number | string; date: string };
export type FeatureCompanyRow = { id: string; name: string; features: string };

const num = (value: number) => value.toLocaleString();

export function AdminDistrictTable({ rows, district }: { rows: DistrictRow[]; district: string }) {
  const columns: CommonTableColumn<DistrictRow>[] = [
    { key: "name", label: "고객사", value: (r) => r.name, sortable: true },
    { key: "territory", label: "영업권", value: (r) => (r.territory ? "포함" : "-"), sortable: true },
    { key: "sales", label: "영업 지역", value: (r) => (r.sales ? "포함" : "-"), sortable: true },
    { key: "customers", label: "거래처", value: (r) => r.customers, align: "right", sortable: true, render: (r) => num(r.customers) },
    { key: "recent", label: "최근 리드", value: (r) => r.recentLeads, align: "right", sortable: true, render: (r) => num(r.recentLeads) },
    { key: "total", label: "전체 리드", value: (r) => r.totalLeads, align: "right", sortable: true, render: (r) => num(r.totalLeads) },
  ];
  return <CommonDataTable columns={columns} emptyMessage="표시할 고객사가 없습니다." filename={`${district}-회사별-집계.csv`} phoneCards rowKey={(r) => r.id} rows={rows} settingsKey="admin-map-districts" />;
}

export function AdminMarketPriceTable({ rows }: { rows: MarketPriceRow[] }) {
  const columns: CommonTableColumn<MarketPriceRow>[] = [
    { key: "name", label: "품목", value: (r) => r.name, sortable: true },
    { key: "variety", label: "품종·등급", value: (r) => r.varietyGrade },
    { key: "unit", label: "조사 단위", value: (r) => r.unit },
    { key: "price", label: "도매가", value: (r) => Number(r.price) || 0, align: "right", sortable: true, render: (r) => `${r.price}원` },
    { key: "date", label: "조사일", value: (r) => r.date, sortable: true },
  ];
  return <CommonDataTable columns={columns} emptyMessage="조회된 가격이 없습니다." filename="도매가.csv" phoneCards rowKey={(r) => r.key} rows={rows} settingsKey="admin-market-prices" />;
}

export function AdminFeatureCompanyTable({ rows }: { rows: FeatureCompanyRow[] }) {
  const columns: CommonTableColumn<FeatureCompanyRow>[] = [
    { key: "name", label: "회사", value: (r) => r.name, sortable: true },
    { key: "features", label: "켜진 기능", value: (r) => r.features },
  ];
  return <CommonDataTable columns={columns} emptyMessage="표시할 회사가 없습니다." filename="회사별-기능.csv" phoneCards rowKey={(r) => r.id} rows={rows} settingsKey="admin-feature-companies" />;
}
