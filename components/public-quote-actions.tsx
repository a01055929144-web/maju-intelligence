"use client";

import { useState } from "react";
import { Check, Copy, Download, Printer, Share2 } from "lucide-react";
import type { PublicSalesQuote } from "@/lib/store";

export function PublicQuoteActions({ quote }: { quote: PublicSalesQuote }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const shareQuote = async () => {
    const shareData = {
      title: `${quote.companyName} ${quote.title}`,
      text: `${quote.recipientName || "담당자"}님, 견적서를 보내드립니다. 유효기간: ${formatDate(quote.validUntil)}`,
      url: window.location.href
    };
    if (navigator.share) {
      await navigator.share(shareData).catch(() => undefined);
      return;
    }
    await copyLink();
  };

  const downloadCsv = () => {
    const rows = [
      ["견적번호", quote.quoteNumber],
      ["수신처", quote.recipientName || "거래처 담당자"],
      ["유효기간", formatDate(quote.validUntil)],
      [],
      ["상품명", "규격", "단위", "수량", "판매단가", "금액"],
      ...quote.items.map((item) => [item.productName, item.specification || "", item.unit, item.quantity, item.salesUnitPrice, item.amount]),
      [],
      ["합계", "", "", "", "", quote.total]
    ];
    const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${quote.quoteNumber}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-6 grid gap-2 print:hidden sm:grid-cols-4" aria-label="견적서 공유 및 저장">
      <button className="maju-button-primary min-h-11 justify-center" onClick={() => void shareQuote()} type="button">
        <Share2 className="h-4 w-4" /> 카카오·문자 공유
      </button>
      <button className="maju-button-secondary min-h-11 justify-center" onClick={() => void copyLink()} type="button">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "복사됨" : "링크 복사"}
      </button>
      <button className="maju-button-secondary min-h-11 justify-center" onClick={downloadCsv} type="button">
        <Download className="h-4 w-4" /> 엑셀용 CSV
      </button>
      <button className="maju-button-secondary min-h-11 justify-center" onClick={() => window.print()} type="button">
        <Printer className="h-4 w-4" /> PDF 저장·인쇄
      </button>
    </div>
  );
}

function escapeCsvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR");
}
