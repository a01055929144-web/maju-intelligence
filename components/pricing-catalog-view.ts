export type PricingCatalogView = "prices" | "catalogs" | "stores" | "groups";

const allViews: PricingCatalogView[] = ["prices", "catalogs", "stores", "groups"];
const basicViews: PricingCatalogView[] = ["prices", "groups"];

export function pricingCatalogViews(marginTemplates: boolean): PricingCatalogView[] {
  return marginTemplates ? allViews : basicViews;
}

export function pricingCatalogViewFrom(value: string | null, marginTemplates: boolean): PricingCatalogView {
  const views = pricingCatalogViews(marginTemplates);
  return views.includes(value as PricingCatalogView) ? value as PricingCatalogView : "prices";
}
