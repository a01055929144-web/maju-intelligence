import { buildFulfillmentLines } from "@/domains/order/fulfillment";
import { listProductCatalogForAdmin } from "@/lib/product-catalog-admin";
import { supabaseRequest } from "@/lib/store";

type OrderRow = { id: string; customer_id: string; delivery_date: string; request_memo: string; store_order_lines: Array<{ product_id: string; product_name: string; specification: string; sales_unit: string; quantity: number; is_market_price: boolean }> };
type CustomerRow = { id: string; customer_name: string; delivery_territory_id: string | null; delivery_vehicle: string | null };

export async function readOrderFulfillment(companyId: string, deliveryDate: string) {
  const company = encodeURIComponent(companyId);
  const [orders, catalog] = await Promise.all([
    supabaseRequest<OrderRow[]>(`store_orders?company_id=eq.${company}&delivery_date=eq.${deliveryDate}&status=eq.received&select=id,customer_id,delivery_date,request_memo,store_order_lines(product_id,product_name,specification,sales_unit,quantity,is_market_price)&order=submitted_at.asc,id.asc&limit=1000`),
    listProductCatalogForAdmin(companyId),
  ]);
  const customerIds = Array.from(new Set(orders.map((order) => order.customer_id)));
  const customers = customerIds.length ? await supabaseRequest<CustomerRow[]>(`normalized_customers?company_id=eq.${company}&id=in.(${customerIds.join(",")})&select=id,customer_name,delivery_territory_id,delivery_vehicle&limit=1000`) : [];
  const territoryIds = Array.from(new Set(customers.map((row) => row.delivery_territory_id).filter((id): id is string => Boolean(id))));
  const territories = territoryIds.length ? await supabaseRequest<Array<{ id: string; name: string }>>(`delivery_territories?company_id=eq.${company}&id=in.(${territoryIds.join(",")})&select=id,name&limit=500`) : [];
  const customerById = new Map(customers.map((row) => [row.id, row]));
  const territoryById = new Map(territories.map((row) => [row.id, row.name]));
  const productById = new Map(catalog.map((row) => [row.id, row]));
  return buildFulfillmentLines(orders.flatMap((order) => {
    const customer = customerById.get(order.customer_id);
    return order.store_order_lines.map((line) => {
      const product = productById.get(line.product_id);
      return {
        orderId: order.id, customerName: customer?.customer_name || "이름 없는 매장", deliveryDate: order.delivery_date,
        territory: (customer?.delivery_territory_id && territoryById.get(customer.delivery_territory_id)) || "권역 미배정",
        vehicle: customer?.delivery_vehicle || "호차 미배정", requestMemo: order.request_memo,
        productId: line.product_id, productName: line.product_name, specification: line.specification, unit: line.sales_unit,
        quantity: Number(line.quantity), marketPrice: line.is_market_price, trackingEnabled: product?.trackingEnabled,
        supplierNames: product?.supplierNames || [], storageLocation: undefined,
      };
    });
  }));
}
