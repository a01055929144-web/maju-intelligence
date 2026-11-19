"use client";

import { CustomerAppShell } from "@/components/customer-app-shell";
import { StoreCustomerReviewWorkspace } from "@/components/store-customer-review-workspace";

export default function CustomerStoresPage() {
  return <CustomerAppShell active="customer-stores" companyName="고객사" mode="customer" subtitle="새 매장을 매출처로 확인합니다." title="새 매장 확인" userName="사용자">
    <StoreCustomerReviewWorkspace />
  </CustomerAppShell>;
}
