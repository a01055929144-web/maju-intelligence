import { redirect } from "next/navigation";
import { AdminPageHeader } from "../admin-page-header";
import { AdminCompanyLinks } from "@/components/admin-company-links";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// CX-140 ④: 마주 관리자 — 모든 고객사의 공개 링크를 보고 만든다(기능이 켜진 고객사만 표시).
export default async function AdminLinksPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return <main className="min-h-screen maju-app-bg">
    <AdminPageHeader active="companies" badge="CX-140" session={session} subtitle="고객사마다 단가표 링크 1개 · 조회수·마지막 열람·만료일" title="고객사 링크" />
    <section className="mx-auto max-w-7xl space-y-4 px-4 py-4"><AdminCompanyLinks /></section>
  </main>;
}
