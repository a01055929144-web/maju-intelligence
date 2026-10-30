import { supabaseRequest } from "@/lib/store";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { verifyStoreLinkToken } from "./store-link-token";
import {
  canOrderForDelivery,
  kstDateTime,
  nextDeliveryDate,
  type DeliveryPolicy,
  type HolidayRule,
} from "@/domains/order/order-rules";
import type { DocumentContent } from "@/domains/pricing/document";

type Link = {
  id: string;
  company_id: string;
  customer_id: string;
  document_version_id: string;
  expires_at: string;
  revoked_at: string | null;
  can_order: boolean;
};
type Version = {
  id: string;
  content: DocumentContent;
  version: number;
  published_at: string;
};
type Customer = {
  id: string;
  customer_name: string;
  address: string | null;
  delivery_territory_id: string | null;
};
type Agreement = {
  product_catalog_id: string;
  sales_unit: string;
  unit_price: number;
  tax_type: "taxable" | "exempt";
  price_includes_tax: boolean;
};
type ProductMode = {
  id: string;
  is_active: boolean;
  order_pricing_mode: "fixed" | "market";
};
type Promotion = {
  id: string;
  starts_on: string;
  ends_on: string;
  stock: number | null;
  per_store_limit: number | null;
};
type RecentPrice = {
  product_id: string;
  unit_price: number;
  document_date: string;
};
type Settings = {
  cutoff_days_before: 0 | 1 | 2;
  cutoff_time: string;
  minimum_amount: number;
  minimum_policy: DeliveryPolicy["minimumPolicy"];
  delivery_fee: number;
  market_price_notice: string;
  notice: string;
};
type Override = {
  delivery_weekdays?: number[] | null;
  cutoff_days_before?: 0 | 1 | 2 | null;
  cutoff_time?: string | null;
  minimum_amount?: number | null;
  minimum_policy?: DeliveryPolicy["minimumPolicy"] | null;
  delivery_fee?: number | null;
};
type Holiday = {
  kind: HolidayRule["kind"];
  weekday: number | null;
  month: number | null;
  day: number | null;
  holiday_date: string | null;
};

function path(table: string, companyId: string, suffix = "") {
  return `${table}?company_id=eq.${encodeURIComponent(companyId)}${suffix}`;
}

export async function readStorefront(
  token: string,
  requestedDeliveryDate?: string,
) {
  const decoded = verifyStoreLinkToken(token);
  if (!decoded) return null;
  const links = await supabaseRequest<Link[]>(
    `storefront_links?id=eq.${encodeURIComponent(decoded.id)}&token_hash=eq.${decoded.hash}&select=id,company_id,customer_id,document_version_id,expires_at,revoked_at,can_order&limit=1`,
  );
  const link = links[0];
  if (
    !link ||
    !areHoldModulesEnabled(link.company_id) ||
    link.revoked_at ||
    new Date(link.expires_at).getTime() <= Date.now()
  )
    return null;
  const company = link.company_id;
  const [versions, customers, settingsRows] = await Promise.all([
    supabaseRequest<Version[]>(
      path(
        "pricing_document_versions",
        company,
        `&id=eq.${link.document_version_id}&select=id,content,version,published_at&limit=1`,
      ),
    ),
    supabaseRequest<Customer[]>(
      path(
        "normalized_customers",
        company,
        `&id=eq.${link.customer_id}&select=id,customer_name,address,delivery_territory_id&limit=1`,
      ),
    ),
    supabaseRequest<Settings[]>(
      path("store_order_settings", company, "&select=*&limit=1"),
    ),
  ]);
  const version = versions[0];
  const customer = customers[0];
  if (!version || !customer) return null;
  const settings: Settings = settingsRows[0] ?? {
    cutoff_days_before: 1,
    cutoff_time: "22:00:00",
    minimum_amount: 0,
    minimum_policy: "notice",
    delivery_fee: 0,
    market_price_notice: "싯가·경매가에 따라 달라질 수 있습니다.",
    notice: "",
  };
  const today = kstDateTime(new Date()).date;
  const priceAvailable =
    version.content.showPrice && version.content.validUntil >= today;
  const canOrder = priceAvailable && link.can_order;
  const productIds = Array.from(
    new Set(
      version.content.lines
        .filter((line) => line.visible)
        .map((line) => line.productId),
    ),
  );
  const promotionIds = Array.from(
    new Set(
      version.content.lines
        .map((line) => line.promotionId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const [
    productModes,
    promotions,
    recentPrices,
    territoryRules,
    customerRules,
    holidays,
  ] = await Promise.all([
    productIds.length
      ? supabaseRequest<ProductMode[]>(
          path(
            "product_catalog",
            company,
            `&id=in.(${productIds.join(",")})&select=id,is_active,order_pricing_mode&limit=100`,
          ),
        )
      : Promise.resolve([]),
    promotionIds.length
      ? supabaseRequest<Promotion[]>(
          path(
            "pricing_promotions",
            company,
            `&id=in.(${promotionIds.join(",")})&select=id,starts_on,ends_on,stock,per_store_limit&limit=100`,
          ),
        )
      : Promise.resolve([]),
    priceAvailable && productIds.length
      ? supabaseRequest<RecentPrice[]>("rpc/store_recent_dispatch_prices", {
          method: "POST",
          body: JSON.stringify({
            p_company: company,
            p_customer: customer.id,
            p_products: productIds,
          }),
        })
      : Promise.resolve([]),
    customer.delivery_territory_id
      ? supabaseRequest<Override[]>(
          path(
            "store_order_territory_rules",
            company,
            `&territory_id=eq.${customer.delivery_territory_id}&select=*&limit=1`,
          ),
        )
      : Promise.resolve([]),
    supabaseRequest<Override[]>(
      path(
        "store_order_customer_rules",
        company,
        `&customer_id=eq.${link.customer_id}&select=*&limit=1`,
      ),
    ),
    supabaseRequest<Holiday[]>(
      path(
        "store_order_holidays",
        company,
        `&or=(territory_id.is.null,territory_id.eq.${customer.delivery_territory_id ?? "00000000-0000-0000-0000-000000000000"})&select=kind,weekday,month,day,holiday_date&limit=200`,
      ),
    ),
  ]);
  const marketIds = new Set(
    productModes
      .filter((item) => item.order_pricing_mode === "market")
      .map((item) => item.id),
  );
  const activeProductIds = new Set(
    productModes.filter((item) => item.is_active).map((item) => item.id),
  );
  const livePromotions = new Map(
    promotions
      .filter(
        (item) =>
          item.starts_on <= today && item.ends_on >= today && item.stock !== 0,
      )
      .map((item) => [item.id, item]),
  );
  const recentByProduct = new Map(
    recentPrices.map((item) => [item.product_id, item]),
  );
  const territory = territoryRules[0] ?? {};
  const store = customerRules[0] ?? {};
  const policy: DeliveryPolicy = {
    weekdays: store.delivery_weekdays ?? territory.delivery_weekdays ?? [],
    cutoffDaysBefore:
      store.cutoff_days_before ??
      territory.cutoff_days_before ??
      settings.cutoff_days_before,
    cutoffTime: (
      store.cutoff_time ??
      territory.cutoff_time ??
      settings.cutoff_time
    ).slice(0, 5),
    minimumAmount:
      store.minimum_amount ??
      territory.minimum_amount ??
      settings.minimum_amount,
    minimumPolicy:
      store.minimum_policy ??
      territory.minimum_policy ??
      settings.minimum_policy,
    deliveryFee:
      store.delivery_fee ?? territory.delivery_fee ?? settings.delivery_fee,
    holidays: holidays.map(
      (item): HolidayRule =>
        item.kind === "weekly"
          ? { kind: "weekly", weekday: item.weekday! }
          : item.kind === "fixed"
            ? { kind: "fixed", month: item.month!, day: item.day! }
            : { kind: "date", date: item.holiday_date! },
    ),
  };
  const deliveryDate = policy.weekdays.length ? nextDeliveryDate(policy) : null;
  const priceDate = requestedDeliveryDate ?? deliveryDate ?? today;
  const deliveryAllowed =
    policy.weekdays.length > 0 && canOrderForDelivery(priceDate, policy);
  const agreements = productIds.length
    ? await supabaseRequest<Agreement[]>(
        path(
          "customer_price_agreements",
          company,
          `&customer_id=eq.${link.customer_id}&product_catalog_id=in.(${productIds.join(",")})&status=eq.active&effective_from=lte.${priceDate}&or=(effective_until.is.null,effective_until.gte.${priceDate})&select=product_catalog_id,sales_unit,unit_price,tax_type,price_includes_tax&order=effective_from.desc,id.desc`,
        ),
      )
    : [];
  const agreementByProduct = new Map<string, Agreement>();
  for (const item of agreements) {
    const key = `${item.product_catalog_id}:${item.sales_unit}`;
    if (!agreementByProduct.has(key)) agreementByProduct.set(key, item);
  }
  return {
    linkId: link.id,
    companyId: company,
    customerId: customer.id,
    documentVersionId: version.id,
    version: version.version,
    title: version.content.title,
    companyName: version.content.companyName,
    footer: version.content.footer,
    customerName: customer.customer_name,
    deliveryAddress: customer.address,
    validUntil: version.content.validUntil,
    priceAvailable,
    canOrder: canOrder && deliveryAllowed,
    nextDeliveryDate: deliveryDate,
    selectedDeliveryDate: priceDate,
    notice: settings.notice,
    marketPriceNotice: settings.market_price_notice,
    policy,
    lines: version.content.lines
      .filter(
        (line) =>
          line.visible &&
          activeProductIds.has(line.productId) &&
          (!line.promotionId || livePromotions.has(line.promotionId)),
      )
      .map((line) => {
        const agreement = agreementByProduct.get(
          `${line.productId}:${line.unit}`,
        );
        const matchingContract =
          agreement?.sales_unit === line.unit ? agreement : null;
        const market = marketIds.has(line.productId);
        return {
          key: `${line.productId}:${line.promotionId ?? ""}`,
          productId: line.productId,
          promotionId: line.promotionId,
          name: line.displayName,
          brand: line.brand,
          spec: line.spec,
          unit: line.unit,
          badge: line.badge,
          startsOn: line.startsOn,
          endsOn: line.endsOn,
          remaining: line.promotionId
            ? (livePromotions.get(line.promotionId)?.stock ?? null)
            : null,
          taxType: matchingContract?.tax_type ?? line.taxType,
          unitPrice:
            priceAvailable && !market
              ? (matchingContract?.unit_price ?? line.price)
              : null,
          priceIncludesTax: matchingContract?.price_includes_tax ?? false,
          isMarketPrice: market,
          maximumQuantity: line.promotionId
            ? (livePromotions.get(line.promotionId)?.per_store_limit ?? null)
            : null,
          recentDispatchPrice:
            recentByProduct.get(line.productId)?.unit_price ?? null,
          recentDispatchDate:
            recentByProduct.get(line.productId)?.document_date ?? null,
        };
      }),
  };
}
