import { canChangeStoreConnection, type StoreConnectionChange, type StoreConnectionRepository } from "../../domains/organization/store-connection";

export async function changeStoreConnection(input: StoreConnectionChange, save: StoreConnectionRepository) {
  if (!canChangeStoreConnection(input.role, input.action)) throw new Error("store_connection_forbidden");
  await save(input);
}
