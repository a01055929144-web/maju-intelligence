"use client";

import { useEffect, useMemo, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "@/components/common-data-table";
import { Dialog } from "@/components/ui/dialog";
import type { ProductCatalogAdminItem } from "@/lib/product-catalog-admin";
import type { InventoryMovement } from "@/lib/inventory";

const movementLabels: Record<string, string> = {
  adjustment: "재고 조정", purchase_in: "매입 입고", purchase_return_out: "매입 반품",
  revision: "정정", sale_out: "매장 출고", sale_return_in: "매출 반품",
};

export function ProductInventoryHistoryDialog({ companyId, onClose, product }: { companyId: string; onClose: () => void; product: ProductCatalogAdminItem }) {
  const [rows, setRows] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const query = new URLSearchParams({ mode: "movements", productId: product.id });
    if (companyId) query.set("companyId", companyId);
    void fetch(`/api/inventory?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { movements?: InventoryMovement[]; message?: string };
        if (!response.ok) throw new Error(body.message || "재고 기록을 불러오지 못했습니다.");
        setRows(body.movements || []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "재고 기록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [companyId, product.id]);
  const columns = useMemo<CommonTableColumn<InventoryMovement>[]>(() => [
    { key: "date", label: "날짜", width: 92, value: (row) => row.business_date },
    { key: "type", label: "구분", width: 88, value: (row) => movementLabels[row.movement_type] || row.movement_type },
    { key: "quantity", label: "수량", align: "right", width: 72, value: (row) => row.quantity_delta, render: (row) => `${row.quantity_delta > 0 ? "+" : ""}${row.quantity_delta.toLocaleString("ko-KR")} ${product.salesUnit || product.unit}` },
    { key: "store", label: "출고 매장", width: 120, value: (row) => row.store_name || "-" },
    { key: "document", label: "전표", priority: 2, width: 120, value: (row) => row.source_document_number_snapshot || "-" },
    { key: "reason", label: "사유", priority: 3, width: 120, value: (row) => row.reason || "-" },
    { key: "actor", label: "처리자", priority: 3, width: 90, value: (row) => row.actor_name || "-" },
  ], [product.salesUnit, product.unit]);
  return <Dialog fullScreenOnMobile onClose={onClose} size="lg" title={`${product.name} · 재고 이동 기록`}>
    <div className="mt-4 min-w-0">
      <CommonDataTable columns={columns} emptyMessage="재고 이동 기록이 없습니다." error={error} filename={`${product.name}_재고이동.csv`} loading={loading} numbered={false} phoneCards rowKey={(row) => row.id} rows={rows} selectable={false} settingsKey={`product-inventory-history:${product.id}`} />
    </div>
  </Dialog>;
}
