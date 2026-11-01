import type { readStorefront } from "./storefront";

type Storefront = NonNullable<Awaited<ReturnType<typeof readStorefront>>>;

/** Explicit public field list: new staff or supplier fields never flow to a store link. */
export function toPublicStorefront(store: Storefront) {
  return {
    version: store.version,
    title: store.title,
    companyName: store.companyName,
    footer: store.footer,
    customerName: store.customerName,
    deliveryAddress: store.deliveryAddress,
    validUntil: store.validUntil,
    priceAvailable: store.priceAvailable,
    canOrder: store.canOrder,
    nextDeliveryDate: store.nextDeliveryDate,
    selectedDeliveryDate: store.selectedDeliveryDate,
    notice: store.notice,
    marketPriceNotice: store.marketPriceNotice,
    policy: {
      weekdays: store.policy.weekdays,
      cutoffDaysBefore: store.policy.cutoffDaysBefore,
      cutoffTime: store.policy.cutoffTime,
      minimumAmount: store.policy.minimumAmount,
      minimumPolicy: store.policy.minimumPolicy,
      deliveryFee: store.policy.deliveryFee,
      holidays: store.policy.holidays,
    },
    lines: store.lines.map((line) => ({
      key: line.key,
      productId: line.productId,
      promotionId: line.promotionId,
      name: line.name,
      brand: line.brand,
      spec: line.spec,
      unit: line.unit,
      badge: line.badge,
      startsOn: line.startsOn,
      endsOn: line.endsOn,
      remaining: line.remaining,
      taxType: line.taxType,
      unitPrice: line.unitPrice,
      priceIncludesTax: line.priceIncludesTax,
      isMarketPrice: line.isMarketPrice,
      maximumQuantity: line.maximumQuantity,
      recentDispatchPrice: line.recentDispatchPrice,
      recentDispatchDate: line.recentDispatchDate,
    })),
  };
}
