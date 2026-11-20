"use client";

import { useState } from "react";
import type { StoreSettlementAccount } from "@/lib/store/07-store-settlement-account";
import { Button } from "./ui/button";

export function StoreSettlementAccountCard({ account, compact = false }: { account?: StoreSettlementAccount; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!account) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(account.number); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setCopied(false); }
  };
  return <section aria-label="입금 계좌" className={`rounded-lg border bg-white ${compact ? "p-3" : "p-4"}`}>
    <h3 className="font-semibold">입금 계좌</h3>
    <p className="mt-1 break-all text-sm">{[account.bank, account.number, account.holder].filter(Boolean).join(" · ")}</p>
    <p className="mt-1 text-xs text-slate-600">후불 주문입니다. 당일 또는 미리 입금해도 됩니다.</p>
    <Button className="mt-3 min-h-11" onClick={() => void copy()} type="button" variant="outline">{copied ? "복사됨" : "계좌 복사"}</Button>
  </section>;
}
