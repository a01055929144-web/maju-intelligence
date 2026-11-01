import { notFound } from "next/navigation";
import { CustomerLoginForm } from "@/app/dashboard/login/page";
import { isCiLayoutFixturesEnabled } from "@/lib/ci-layout-fixtures";

export default function LoginPreviewPage() {
  if (!isCiLayoutFixturesEnabled()) notFound();
  return <CustomerLoginForm accountLoginEnabled />;
}
