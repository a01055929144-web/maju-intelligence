import "server-only";
import { storeOrderActor, type StoreOrderMemberResolver, type StoreOrderScope } from "../../domains/order/store-order-member";
import { getStoreOrderMemberContext } from "../store/07-store-member-context";

// 07 #348, verified head 21f5a7d / CI #2291; implementation remains owned by 07.
export async function getStoreOrderActor(scope: StoreOrderScope, resolve: StoreOrderMemberResolver = getStoreOrderMemberContext) {
  return storeOrderActor(scope, await resolve(scope));
}
