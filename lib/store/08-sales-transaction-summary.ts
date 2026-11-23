import { isProductionStoreConfigured, supabaseRequest } from "./00-core";
import type { SalesTransactionItem, SalesTransactionSummary } from "../store";

export async function matchSalesTransactionsToCustomer(
  companyId: string,
  customerKey: string,
  targetCustomerId: string
): Promise<{ matchedTransactionCount: number; customerName: string }> {
  if (!isProductionStoreConfigured()) throw new Error("Supabase is not configured.");
  if (!customerKey.trim()) throw new Error("연결할 거래처 key가 없습니다.");

  const targetRows = await supabaseRequest<Array<{ id: string; customer_name: string; normalized_key: string }>>(
    `normalized_customers?select=id,customer_name,normalized_key&company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(
      targetCustomerId
    )}&limit=1`
  );
  const targetCustomer = targetRows[0];
  if (!targetCustomer) throw new Error("연결할 거래처를 찾을 수 없습니다.");
  if (!targetCustomer.normalized_key) throw new Error("대상 거래처에 기준 key가 없어 연결할 수 없습니다.");

  const updatedRows = await supabaseRequest<Array<{ id: string }>>(
    `sales_transactions?company_id=eq.${encodeURIComponent(companyId)}&customer_key=eq.${encodeURIComponent(customerKey)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ customer_key: targetCustomer.normalized_key })
    }
  );

  return { matchedTransactionCount: updatedRows.length, customerName: targetCustomer.customer_name };
}

export function summarizeSalesTransactions(items: SalesTransactionItem[], truncated = false): SalesTransactionSummary {
  const totalAmount = items.reduce((total, item) => total + item.salesAmount, 0);
  const matchedAmount = items.filter((item) => item.matched).reduce((total, item) => total + item.salesAmount, 0);
  const unmatchedAmount = totalAmount - matchedAmount;
  const matchedCustomerIds = new Set(items.filter((item) => item.matched && item.customerId).map((item) => item.customerId as string));
  const unmatchedCustomerNames = new Set(items.filter((item) => !item.matched).map((item) => item.customerName || "미지정 거래처"));
  const distinctCustomerKeys = new Set(items.map((item) => item.customerId || `name:${item.customerName || "미지정 거래처"}`));

  const customerGroups = new Map<
    string,
    { customerId?: string; customerName: string; matched: boolean; latestSalesDate?: string; totalAmount: number; transactionCount: number }
  >();

  for (const item of items) {
    const groupKey = item.customerId || `name:${item.customerName || "미지정 거래처"}`;
    const current = customerGroups.get(groupKey) || {
      customerId: item.customerId,
      customerName: item.customerName || "미지정 거래처",
      matched: item.matched,
      totalAmount: 0,
      transactionCount: 0
    };
    current.totalAmount += item.salesAmount;
    current.transactionCount += 1;
    if (!current.latestSalesDate || compareDateText(item.salesDate, current.latestSalesDate) > 0) {
      current.latestSalesDate = item.salesDate;
    }
    customerGroups.set(groupKey, current);
  }

  const topCustomers = Array.from(customerGroups.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 8)
    .map((group) => ({
      customerId: group.customerId,
      customerName: group.customerName,
      matched: group.matched,
      grade: getSalesAmountGrade(group.totalAmount),
      latestSalesDate: group.latestSalesDate,
      share: totalAmount ? Math.round((group.totalAmount / totalAmount) * 100) : 0,
      totalAmount: group.totalAmount,
      transactionCount: group.transactionCount
    }));
  const topProducts = summarizeSalesGroup(items, (item) => item.productName || "미지정 품목").slice(0, 8).map((item) => ({
    productName: item.key,
    share: totalAmount ? Math.round((item.totalAmount / totalAmount) * 100) : 0,
    totalAmount: item.totalAmount,
    transactionCount: item.transactionCount
  }));

  const unmatchedGroupMap = new Map<
    string,
    { customerKey: string; customerName: string; latestSalesDate?: string; totalAmount: number; transactionCount: number }
  >();
  for (const item of items) {
    if (item.matched || !item.customerKey) continue;
    const current = unmatchedGroupMap.get(item.customerKey) || {
      customerKey: item.customerKey,
      customerName: item.customerName || "미지정 거래처",
      totalAmount: 0,
      transactionCount: 0
    };
    current.totalAmount += item.salesAmount;
    current.transactionCount += 1;
    if (!current.latestSalesDate || compareDateText(item.salesDate, current.latestSalesDate) > 0) {
      current.latestSalesDate = item.salesDate;
    }
    unmatchedGroupMap.set(item.customerKey, current);
  }
  const unmatchedGroups = Array.from(unmatchedGroupMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    averageOrderAmount: items.length ? Math.round(totalAmount / items.length) : 0,
    topCustomers,
    topProducts,
    unmatchedGroups,
    totalAmount,
    transactionCount: items.length,
    customerCount: distinctCustomerKeys.size,
    matchedCustomerCount: matchedCustomerIds.size,
    unmatchedCustomerCount: unmatchedCustomerNames.size,
    matchedAmount,
    unmatchedAmount,
    matchRate: totalAmount ? Math.round((matchedAmount / totalAmount) * 100) : 0,
    latestSalesDate: items.find((item) => item.salesDate)?.salesDate,
    items,
    truncated
  };
}

export function summarizeSalesGroup(items: SalesTransactionItem[], getKey: (item: SalesTransactionItem) => string) {
  const groups = new Map<string, { key: string; latestSalesDate?: string; totalAmount: number; transactionCount: number }>();

  for (const item of items) {
    const key = getKey(item).trim() || "미지정";
    const current = groups.get(key) || { key, totalAmount: 0, transactionCount: 0 };
    current.totalAmount += item.salesAmount;
    current.transactionCount += 1;
    if (!current.latestSalesDate || compareDateText(item.salesDate, current.latestSalesDate) > 0) {
      current.latestSalesDate = item.salesDate;
    }
    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

export function compareDateText(left?: string, right?: string) {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return left.localeCompare(right);
}

export function getSalesAmountGrade(amount: number): "A" | "B" | "C" {
  if (amount >= 2500000) return "A";
  if (amount >= 1800000) return "B";
  return "C";
}
