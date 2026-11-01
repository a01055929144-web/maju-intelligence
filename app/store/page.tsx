import { notFound } from "next/navigation";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { StorefrontWorkspace } from "@/components/storefront-workspace";

export const dynamic = "force-dynamic";

export default function StorePage() {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) notFound();
  return <><meta name="referrer" content="no-referrer" /><StorefrontWorkspace /></>;
}
