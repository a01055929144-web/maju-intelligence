import "server-only";
import { storeOrderActor, type StoreOrderMemberResolver, type StoreOrderScope } from "../../domains/order/store-order-member";

// 07's public, verified PR head will supply getStoreOrderMemberContext.
// Until that adapter is connected, all order writes fail closed.
const unavailable: StoreOrderMemberResolver = async () => null;
export async function getStoreOrderActor(scope: StoreOrderScope, getStoreOrderMemberContext: StoreOrderMemberResolver = unavailable) {
  return storeOrderActor(scope, await getStoreOrderMemberContext(scope));
}
