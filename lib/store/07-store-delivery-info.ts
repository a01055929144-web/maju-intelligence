import "server-only";

import { randomUUID } from "crypto";
import { DELIVERY_RECEIVE_METHODS } from "../../domains/order/delivery-info";
import { flagsFor } from "../pricing/store-delivery-info-read";
import { getStoreProfileInformation, updateStoreProfileDeliveryInformation, updateStoreProfileInformation } from "./07-store-information";
import { updateStoreAddress } from "./07-store-address-management";

export class DeliveryInfoError extends Error {}

export type DeliveryInfoSave = {
  baseAddress: string; addressDetail: string; accessNote?: string; deliveryContactPhone?: string; receiveMethod?: string;
  accessPassword?: string; accessControlled?: boolean;
};

/**
 * 저장은 이 한 경로: 주소는 normalized_customers.delivery_*(+권역 추천), 나머지는 store_profiles(RPC)에 같은 요청 안에서.
 * 비밀번호 값은 RPC로만 보내고 응답·로그에 싣지 않는다.
 */
export async function saveStoreDeliveryInfo(scope: { companyId: string; storeAccountId: string }, authUserId: string, input: DeliveryInfoSave) {
  const required = flagsFor(scope.companyId);
  const baseAddress = input.baseAddress.trim(), addressDetail = input.addressDetail.trim();
  if (!baseAddress || !addressDetail || addressDetail.length > 100) throw new DeliveryInfoError("검색한 배송 주소와 상세 주소(100자 이하)를 모두 입력해 주세요.");
  const information = required.profile ? await getStoreProfileInformation(scope.companyId, scope.storeAccountId, false, required.receiveMethod) : null;
  if (required.profile && !information) throw new DeliveryInfoError("매장 정보를 찾지 못했습니다.");
  const accessNote = (input.accessNote ?? "").trim().slice(0, 500), phone = (input.deliveryContactPhone ?? "").trim().slice(0, 30);
  const receiveMethod = (input.receiveMethod ?? "").trim(), password = input.accessPassword ?? "";
  if (required.profile) {
    if (!accessNote) throw new DeliveryInfoError("적치 위치를 입력해 주세요.");
    if (phone.replace(/\D/g, "").length < 9) throw new DeliveryInfoError("배송 연락처를 확인해 주세요.");
    if (required.receiveMethod) {
      if (!DELIVERY_RECEIVE_METHODS.some(([key]) => key === receiveMethod)) throw new DeliveryInfoError("받는 방법을 골라 주세요.");
      if ((receiveMethod === "dawn" || input.accessControlled) && !password && !information?.hasAccessPassword) throw new DeliveryInfoError("출입 비밀번호를 입력해 주세요.");
      if (password.length > 100) throw new DeliveryInfoError("출입 비밀번호는 100자 이하로 입력해 주세요.");
    }
  }
  await updateStoreAddress({ companyId: scope.companyId, storeAccountId: scope.storeAccountId, baseAddress, addressDetail });
  if (!information) return;
  const changes = { storeName: information.storeName, representativeName: information.representativeName, baseAddress, addressDetail, accessNote,
    deliveryContactPhone: phone, preferredDeliveryTime: information.preferredDeliveryTime };
  if (required.receiveMethod) await updateStoreProfileDeliveryInformation(information.storeProfileId, authUserId,
    { ...changes, taxInvoiceEmail: information.taxInvoiceEmail ?? "", receiveMethod, ...(password ? { accessPassword: password } : {}) }, randomUUID());
  else await updateStoreProfileInformation(information.storeProfileId, authUserId, changes, randomUUID());
}
