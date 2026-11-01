import { notFound } from "next/navigation";
import { isCiLayoutFixturesEnabled } from "../../../lib/ci-layout-fixtures";
import { ProductCatalogWorkspace } from "../../../components/product-catalog-workspace";

export default function CustomerItemsPreviewPage() {
  if (!isCiLayoutFixturesEnabled()) notFound();
  return <main className="min-h-screen bg-slate-100 p-6"><ProductCatalogWorkspace initialTab="supplier" importTargetsEnabled customerItemsEnabled rowEditorEnabled importAuditV2Enabled /></main>;
}
