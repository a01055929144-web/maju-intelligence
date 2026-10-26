import DashboardPage from "@/app/dashboard/page";

type LeadDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ companyId?: string }>;
};

export default async function LeadDetailPage({ params, searchParams }: LeadDetailPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams || Promise.resolve({} as { companyId?: string })]);
  return DashboardPage({
    searchParams: Promise.resolve({
      companyId: query.companyId,
      detailMode: "page",
      lead: id,
      routeMode: "leads"
    })
  });
}
