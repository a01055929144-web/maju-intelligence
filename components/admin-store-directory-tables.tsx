"use client";

import Link from "next/link";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";

export type AdminStoreTableRow = {
  id: string;
  companyNames: string;
  storeName: string;
  ownerName: string;
  status: string;
  createdAt: string;
  recentOrderAt: string | null;
};

export type AdminStoreMemberTableRow = {
  id: string;
  storeId: string;
  name: string;
  kakaoLinked: boolean;
  storeName: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
};

const date = (value: string | null) => value ? new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "없음";

export function AdminStoreDirectoryTable({ rows }: { rows: AdminStoreTableRow[] }) {
  const columns: CommonTableColumn<AdminStoreTableRow>[] = [
    { key: "company", label: "회사", value: row => row.companyNames, searchable: true, sortable: true, priority: 2 },
    { key: "store", label: "매장", value: row => row.storeName, searchable: true, sortable: true, render: row => <Link className="font-black text-violet-800 underline" href={`/admin/stores?storeId=${encodeURIComponent(row.id)}`}>{row.storeName}</Link> },
    { key: "owner", label: "점주", value: row => row.ownerName, searchable: true, sortable: true },
    { key: "status", label: "상태", value: row => row.status, sortable: true },
    { key: "joined", label: "가입일", value: row => row.createdAt, sortable: true, render: row => date(row.createdAt), priority: 2 },
    { key: "order", label: "최근 주문", value: row => row.recentOrderAt || "", sortable: true, render: row => date(row.recentOrderAt), priority: 1 },
  ];
  return <CommonDataTable columns={columns} emptyMessage="조건에 맞는 매장이 없습니다." filename="관리자-매장-목록.csv" phoneCards rowKey={row => row.id} rows={rows} selectable={false} settingsKey="admin-store-directory" />;
}

export function AdminStoreMemberDirectoryTable({ rows }: { rows: AdminStoreMemberTableRow[] }) {
  const columns: CommonTableColumn<AdminStoreMemberTableRow>[] = [
    { key: "name", label: "이름", value: row => row.name, searchable: true, sortable: true, render: row => <Link className="font-black text-violet-800 underline" href={`/admin/stores?storeId=${encodeURIComponent(row.storeId)}`}>{row.name}</Link> },
    { key: "kakao", label: "카카오", value: row => row.kakaoLinked ? "연결" : "미연결", sortable: true },
    { key: "store", label: "연결 매장", value: row => row.storeName, searchable: true, sortable: true },
    { key: "role", label: "역할", value: row => row.role, sortable: true },
    { key: "status", label: "상태", value: row => row.status, sortable: true },
    { key: "login", label: "최근 로그인", value: row => row.lastLoginAt || "", sortable: true, render: row => date(row.lastLoginAt), priority: 1 },
    { key: "manage", label: "관리", value: () => "연결 관리", exportable: false, render: row => <Link className="inline-flex min-h-11 items-center font-black text-violet-800 underline" href={`/admin/stores?storeId=${encodeURIComponent(row.storeId)}`}>연결 해제·강제 연결</Link> },
  ];
  return <CommonDataTable columns={columns} emptyMessage="등록된 점주·구성원이 없습니다." filename="관리자-점주-구성원-목록.csv" phoneCards rowKey={row => row.id} rows={rows} selectable={false} settingsKey="admin-store-members" />;
}
