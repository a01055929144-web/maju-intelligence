import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { documentSharingEnabled } from "../../lib/pricing/document-share-feature";
import { PublicPricingDocument } from "../../components/public-pricing-document";
import { PublicStoreTestBanner } from "../../components/public-store-test-banner";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "공유 문서", referrer: "no-referrer", robots: { index: false, follow: false } };
export default function PublicDocumentPage() {
  if (!documentSharingEnabled()) notFound();
  return <><PublicStoreTestBanner /><PublicPricingDocument /></>;
}
