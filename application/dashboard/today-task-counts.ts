import type { DocumentDraft } from "../../domains/pricing/document";
import { pricingDocuments } from "../pricing/documents";
import { pricingDocumentsRepository } from "../../lib/pricing/documents-repository";
import { supabaseRequest } from "../../lib/store";

type LinkRow = { id: string };
type LinkMetric = { link_id: string; order_count: number; recent_views: number };

export type TodayTaskCounts = {
  documentRecalculation: number;
  highInterest: number;
  unavailable: boolean;
};

const documents = pricingDocuments(pricingDocumentsRepository);

async function countHighInterestLinks(companyId: string) {
  const links = await supabaseRequest<LinkRow[]>(
    `storefront_links?company_id=eq.${encodeURIComponent(companyId)}&select=id&order=issued_at.desc,id.desc&limit=1000`,
  );
  if (!links.length) return 0;
  const metrics = await supabaseRequest<LinkMetric[]>("rpc/storefront_link_metrics", {
    method: "POST",
    body: JSON.stringify({ p_company: companyId, p_links: links.map((link) => link.id) }),
  });
  return metrics.filter((metric) => metric.recent_views >= 3 && metric.order_count === 0).length;
}

async function countDocumentsToRecalculate(scope: { actor: string; companyId: string; manager: boolean }) {
  let count = 0;
  let loaded = 0;
  for (let page = 1; page <= 20; page += 1) {
    const result = await documents.read<{ items: DocumentDraft[]; total: number }>(scope, "list", { page, search: "" });
    count += result.items.filter((document) => document.recalculation?.needsRecalculation).length;
    loaded += result.items.length;
    if (loaded >= result.total) break;
  }
  return count;
}

export async function loadTodayTaskCounts(scope: { actor: string; companyId: string; includeDocuments: boolean; includeLinks: boolean; manager: boolean }): Promise<TodayTaskCounts> {
  if (!scope.manager) return { documentRecalculation: 0, highInterest: 0, unavailable: false };
  const results = await Promise.allSettled([
    scope.includeLinks ? countHighInterestLinks(scope.companyId) : Promise.resolve(0),
    scope.includeDocuments ? countDocumentsToRecalculate(scope) : Promise.resolve(0),
  ]);
  return {
    highInterest: results[0].status === "fulfilled" ? results[0].value : 0,
    documentRecalculation: results[1].status === "fulfilled" ? results[1].value : 0,
    unavailable: results.some((result) => result.status === "rejected"),
  };
}
