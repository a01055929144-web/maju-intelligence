import "server-only";
import { storeOrderActor, type StoreOrderMemberResolver, type StoreOrderScope } from "../../domains/order/store-order-member";
import { getStoreOrderMemberContext } from "../store/07-store-member-context";

export async function getStoreOrderActor(scope: StoreOrderScope, resolve: StoreOrderMemberResolver = getStoreOrderMemberContext) {
  return storeOrderActor(scope, await resolve(scope));
}
