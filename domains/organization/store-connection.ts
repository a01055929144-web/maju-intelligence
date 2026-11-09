import type { StoreAccountRole } from "./store-cost-access";

export type StoreConnectionAction = "leave" | "close";
export type StoreConnectionActor = {
  authUserId: string; companyId: string; memberId: string; storeAccountId: string; role: StoreAccountRole;
};
export function canChangeStoreConnection(role: StoreAccountRole, action: StoreConnectionAction) {
  return action === "close" ? role === "owner" : role !== "owner";
}
export type StoreConnectionChange = StoreConnectionActor & { action: StoreConnectionAction };
export type StoreConnectionRepository = (input: StoreConnectionChange) => Promise<void>;
