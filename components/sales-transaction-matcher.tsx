"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { formatNumber, formatWon } from "@/domains/shared/money";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type UnmatchedGroup = {
  customerKey: string;
  customerName: string;
  latestSalesDate?: string;
  totalAmount: number;
  transactionCount: number;
};

type CustomerOption = {
  id: string;
  customerName: string;
  address: string;
  region: string;
};

export function SalesTransactionMatcher({
  companyId,
  unmatchedGroups
}: {
  readonly companyId?: string;
  readonly unmatchedGroups: UnmatchedGroup[];
}) {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerLoadError, setCustomerLoadError] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const endpoint = companyId ? `/api/customers?companyId=${encodeURIComponent(companyId)}` : "/api/customers";

  useEffect(() => {
    let cancelled = false;
    setLoadingCustomers(true);
    setCustomerLoadError("");
    fetchWithTimeout(endpoint, { cache: "no-store" }, 10000)
      .then((res) => (res.ok ? res.json() : { customers: [] }))
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.customers) ? data.customers : [];
        setCustomers(
          rows.map((customer: { id: string; customerName: string; address?: string; region?: string }) => ({
            id: customer.id,
            customerName: customer.customerName,
            address: customer.address || "",
            region: customer.region || ""
          }))
        );
      })
      .catch(() => {
        if (!cancelled) {
          setCustomers([]);
          setCustomerLoadError("거래처 목록을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCustomers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const filteredCustomers = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return customers.slice(0, 30);
    return customers.filter((customer) => `${customer.customerName} ${customer.address}`.toLowerCase().includes(trimmed)).slice(0, 30);
  }, [customers, query]);

  const submitMatch = useCallback(
    async (customerKey: string, targetCustomerId: string, targetCustomerName: string) => {
      setSubmittingKey(customerKey);
      setMessage(null);
      try {
        const response = await fetchWithTimeout("/api/revenue/transactions/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, customerKey, customerId: targetCustomerId })
        }, 12000);
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || "매칭 처리에 실패했습니다.");
        setMessage({ tone: "ok", text: `${targetCustomerName}(으)로 ${data?.matchedTransactionCount ?? 0}건을 연결했습니다.` });
        setOpenKey(null);
        setQuery("");
        router.refresh();
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "매칭 처리에 실패했습니다." });
      } finally {
        setSubmittingKey(null);
      }
    },
    [companyId, router]
  );

  if (!unmatchedGroups.length) return null;

  return (
    <section className="maju-section-card border-amber-200/80">
      <div className="maju-card-header flex flex-wrap items-center justify-between gap-3 border-amber-200/80 bg-amber-50/70">
        <div>
          <p className="maju-section-title">거래처 미매칭 수동 연결</p>
          <p className="mt-1 text-xs font-bold leading-5 text-amber-900">실제 거래처를 선택하면 같은 이름으로 들어온 거래를 한 번에 연결합니다.</p>
        </div>
        <Badge className="bg-amber-100 text-amber-800">{formatNumber(unmatchedGroups.length)}건 미매칭</Badge>
      </div>

      {message ? (
        <Notice className="mx-4 mt-4" kind={message.tone === "ok" ? "success" : "error"}>{message.text}</Notice>
      ) : null}

      <div className="divide-y divide-slate-100">
        {unmatchedGroups.map((group) => (
          <div className="p-4" key={group.customerKey}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">{group.customerName}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {formatNumber(group.transactionCount)}건 · {formatWon(Math.round(group.totalAmount))} · 최근 {group.latestSalesDate || "-"}
                </p>
              </div>
              <button
                aria-expanded={openKey === group.customerKey}
                className="maju-button-secondary w-full justify-center sm:w-auto"
                onClick={() => {
                  setOpenKey(openKey === group.customerKey ? null : group.customerKey);
                  setQuery(openKey === group.customerKey ? "" : group.customerName);
                }}
                type="button"
              >
                <Link2 className="h-3.5 w-3.5" />
                거래처 연결
              </button>
            </div>

            {openKey === group.customerKey ? (
              <div className="maju-filter-box mt-3 bg-slate-50/60 p-3" role="region" aria-label={`${group.customerName} 거래처 연결`}>
                <SearchInput inputProps={{ autoFocus: true, role: "textbox" }} onChange={setQuery} placeholder="거래처명 또는 주소로 검색" size="sm" value={query} />
                <div className="mt-2 max-h-52 space-y-1 overflow-auto">
                  {loadingCustomers ? (
                    <LoadingState bare label="거래처 목록을 불러오는 중입니다." />
                  ) : customerLoadError ? (
                    <ErrorState bare message={customerLoadError} />
                  ) : filteredCustomers.length ? (
                    filteredCustomers.map((customer) => (
                      <button
                        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-xs font-bold text-slate-700 hover:bg-teal-50 disabled:opacity-50"
                        disabled={submittingKey === group.customerKey}
                        key={customer.id}
                        onClick={() => void submitMatch(group.customerKey, customer.id, customer.customerName)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{customer.customerName}</span>
                          <span className="mt-0.5 block truncate font-medium text-slate-400">{customer.address || customer.region || "주소 미등록"}</span>
                        </span>
                        {submittingKey === group.customerKey ? <span className="shrink-0 text-teal-600">연결 중…</span> : null}
                      </button>
                    ))
                  ) : (
                    <EmptyState bare description="상호 일부나 주소로 다시 검색하세요." message="일치하는 거래처가 없습니다." />
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
