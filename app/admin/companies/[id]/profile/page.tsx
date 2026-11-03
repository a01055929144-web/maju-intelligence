import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/app/admin/admin-page-header";
import { CompanyProfileForm } from "@/components/company-profile-form";
import { getAdminSession } from "@/lib/auth";

export default async function AdminCompanyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const { id } = await params;
  return (
    <main className="min-h-screen maju-app-bg">
      <AdminPageHeader active="companies" badge="회사 정보" session={session} subtitle="고객사 정보를 한 곳에서 관리합니다. 잠금 항목과 관리자 메모도 여기서 바꿉니다." title="고객사 회사 정보" />
      <section className="mx-auto max-w-5xl space-y-4 px-4 py-5">
        <Link className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50" href={`/admin/companies?companyId=${encodeURIComponent(id)}`}>
          <ArrowLeft className="h-4 w-4" /> 고객사 관리로
        </Link>
        <CompanyProfileForm companyId={id} />
      </section>
    </main>
  );
}
