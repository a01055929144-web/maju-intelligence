"use client";
import { useEffect, useRef, useState } from "react";
import type { DocumentInfoItem } from "@/domains/pricing/document";
import { orderFooterNotice } from "@/domains/pricing/document-order-footer";
import { documentRequest } from "@/lib/pricing/document-client";

export function useDocumentOrderFooter(companyId: string | undefined, customerId: string | undefined, enabled: boolean) {
  const key = enabled && companyId ? `${companyId}:${customerId || ""}` : "";
  const [result, setResult] = useState<{ key: string; items: DocumentInfoItem[]; error: string }>();
  const ready = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    ready.current = Promise.resolve();
    if (key && companyId) {
      const loading = documentRequest<DocumentInfoItem[]>(companyId, "order-footer", { customerId }).then(({result: items}) => {
        if (active) setResult({ key, items, error: "" });
      }).catch(() => {
        const error = "주문 설정을 불러오지 못했습니다. 미리보기를 다시 열어 주세요.";
        if (active) setResult({ key, items: orderFooterNotice("주문 설정 확인 필요"), error });
        throw new Error(error);
      });
      ready.current = loading; void loading.catch(() => undefined);
    }
    return () => { active = false; };
  }, [key, companyId, customerId]);
  return { items: !key ? undefined : result?.key === key ? result.items : orderFooterNotice("주문 설정 확인 중"),
    error: result?.key === key ? result.error : "", loading: Boolean(key && result?.key !== key), ready };
}
