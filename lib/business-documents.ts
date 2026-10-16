import { randomUUID } from "crypto";
import { calculateErpLine, calculateErpTotals, type ErpTaxType } from "../domains/erp/business-document";
import { supabaseRequest } from "./store";

const enc = encodeURIComponent;

export type BusinessDocumentType = "sale" | "purchase" | "sale_return" | "purchase_return";
export type BusinessDocumentStatus = "draft" | "confirmed" | "cancelled";
export type BusinessDocumentLineInput = {
  productCatalogId?: string;
  supplierProductId?: string;
  productCode?: string;
  productName: string;
  specification?: string;
  unit: string;
  taxType: ErpTaxType;
  quantity: number;
  unitPrice: number;
};
export type SaveBusinessDocumentInput = {
  id?: string;
  documentType: BusinessDocumentType;
  documentDate: string;
  customerId?: string;
  supplierId?: string;
  originalDocumentId?: string;
  memo?: string;
  lines: BusinessDocumentLineInput[];
};
export type ErpActor = { name: string; userId?: string };

type DocumentRow = {
  id: string; company_id: string; document_type: BusinessDocumentType; document_number: string;
  document_date: string; status: BusinessDocumentStatus; customer_id: string | null; supplier_id: string | null;
  original_document_id: string | null; partner_name_snapshot: string; memo: string | null;
  taxable_supply_amount: number; exempt_supply_amount: number; tax_amount: number; total_amount: number;
  created_at: string; confirmed_at: string | null; cancelled_at: string | null;
};
type LineRow = {
  id: string; document_id: string; sort_order: number; product_catalog_id: string | null; supplier_product_id: string | null;
  product_code_snapshot: string | null; product_name_snapshot: string; specification_snapshot: string | null;
  unit_snapshot: string; tax_type_snapshot: ErpTaxType; quantity: number; unit_price: number;
  supply_amount: number; tax_amount: number; total_amount: number;
};

export type BusinessDocumentListItem = ReturnType<typeof mapDocument>;
export type BusinessDocumentDetail = BusinessDocumentListItem & { lines: ReturnType<typeof mapLine>[] };

function mapDocument(row: DocumentRow) {
  return {
    id: row.id, companyId: row.company_id, documentType: row.document_type, documentNumber: row.document_number,
    documentDate: row.document_date, status: row.status, customerId: row.customer_id || undefined,
    supplierId: row.supplier_id || undefined, originalDocumentId: row.original_document_id || undefined,
    partnerName: row.partner_name_snapshot, memo: row.memo || undefined,
    taxableSupplyAmount: Number(row.taxable_supply_amount), exemptSupplyAmount: Number(row.exempt_supply_amount),
    taxAmount: Number(row.tax_amount), totalAmount: Number(row.total_amount), createdAt: row.created_at,
    confirmedAt: row.confirmed_at || undefined, cancelledAt: row.cancelled_at || undefined,
  };
}
function mapLine(row: LineRow) {
  return {
    id: row.id, lineNumber: row.sort_order, productCatalogId: row.product_catalog_id || undefined,
    supplierProductId: row.supplier_product_id || undefined, productCode: row.product_code_snapshot || undefined,
    productName: row.product_name_snapshot, specification: row.specification_snapshot || undefined,
    unit: row.unit_snapshot, taxType: row.tax_type_snapshot, quantity: Number(row.quantity), unitPrice: Number(row.unit_price),
    supplyAmount: Number(row.supply_amount), taxAmount: Number(row.tax_amount), totalAmount: Number(row.total_amount),
  };
}

export async function listBusinessDocuments(companyId: string, filters: {
  cursor?: string; dateFrom?: string; dateTo?: string; type?: string; status?: string; partnerId?: string;
} = {}) {
  const clauses = [
    `company_id=eq.${enc(companyId)}`,
    filters.dateFrom ? `document_date=gte.${enc(filters.dateFrom)}` : "",
    filters.dateTo ? `document_date=lte.${enc(filters.dateTo)}` : "",
    filters.type ? `document_type=eq.${enc(filters.type)}` : "",
    filters.status ? `status=eq.${enc(filters.status)}` : "",
    filters.cursor ? `created_at=lt.${enc(filters.cursor)}` : "",
    filters.partnerId ? `or=(customer_id.eq.${enc(filters.partnerId)},supplier_id.eq.${enc(filters.partnerId)})` : "",
  ].filter(Boolean).join("&");
  const rows = await supabaseRequest<DocumentRow[]>(
    `business_documents?select=*&${clauses}&order=created_at.desc&limit=51`,
  );
  return { items: rows.slice(0, 50).map(mapDocument), nextCursor: rows.length > 50 ? rows[49].created_at : undefined };
}

export async function getBusinessDocument(companyId: string, id: string): Promise<BusinessDocumentDetail> {
  const [documents, lines] = await Promise.all([
    supabaseRequest<DocumentRow[]>(`business_documents?select=*&company_id=eq.${enc(companyId)}&id=eq.${enc(id)}&limit=1`),
    supabaseRequest<LineRow[]>(`business_document_lines?select=*&company_id=eq.${enc(companyId)}&document_id=eq.${enc(id)}&order=sort_order`),
  ]);
  if (!documents[0]) throw new Error("전표를 찾지 못했습니다.");
  return { ...mapDocument(documents[0]), lines: lines.map(mapLine) };
}

async function getPartnerSnapshot(companyId: string, input: SaveBusinessDocumentInput) {
  if (input.documentType.startsWith("sale")) {
    const rows = await supabaseRequest<Array<{ id: string; customer_name: string; business_registration_number: string | null; representative_name: string | null; address: string | null; phone: string | null }>>(
      `normalized_customers?select=id,customer_name,business_registration_number,representative_name,address,phone&company_id=eq.${enc(companyId)}&id=eq.${enc(input.customerId || "")}&limit=1`,
    );
    if (!rows[0]) throw new Error("매출처를 선택해 주세요.");
    return { id: rows[0].id, name: rows[0].customer_name, businessNumber: rows[0].business_registration_number, representative: rows[0].representative_name, address: rows[0].address, contact: rows[0].phone };
  }
  const rows = await supabaseRequest<Array<{ id: string; name: string; business_number: string | null; representative_name: string | null; contact_phone: string | null }>>(
    `product_suppliers?select=id,name,business_number,representative_name,contact_phone&company_id=eq.${enc(companyId)}&id=eq.${enc(input.supplierId || "")}&limit=1`,
  );
  if (!rows[0]) throw new Error("매입처를 선택해 주세요.");
  return { id: rows[0].id, name: rows[0].name, businessNumber: rows[0].business_number, representative: rows[0].representative_name, address: null, contact: rows[0].contact_phone };
}

function validateDraft(input: SaveBusinessDocumentInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate)) throw new Error("거래일을 확인해 주세요.");
  if (!input.lines.length) throw new Error("품목을 한 개 이상 추가해 주세요.");
  if (input.lines.length > 500) throw new Error("한 전표에는 품목을 최대 500개까지 저장할 수 있습니다.");
  input.lines.forEach((line, index) => {
    if (!line.productName.trim()) throw new Error(`${index + 1}번째 품목명을 입력해 주세요.`);
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error(`${index + 1}번째 수량을 확인해 주세요.`);
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) throw new Error(`${index + 1}번째 단가를 확인해 주세요.`);
  });
}

export async function saveBusinessDocument(companyId: string, input: SaveBusinessDocumentInput, actor: ErpActor) {
  validateDraft(input);
  const partner = await getPartnerSnapshot(companyId, input);
  const existing = input.id ? await getBusinessDocument(companyId, input.id) : null;
  if (existing && existing.status !== "draft") throw new Error("확정되거나 취소된 전표는 수정할 수 없습니다.");
  if (existing && existing.documentType !== input.documentType) throw new Error("전표 유형은 변경할 수 없습니다.");
  let documentNumber = existing?.documentNumber;
  if (!documentNumber || documentNumber.slice(documentNumber.indexOf("-") + 1, documentNumber.lastIndexOf("-")) !== input.documentDate.slice(0, 4)) {
    documentNumber = await supabaseRpc<string>("next_erp_number", { p_company_id: companyId, p_sequence_kind: input.documentType, p_business_date: input.documentDate });
  }
  const totals = calculateErpTotals(input.lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice, taxType: line.taxType })));
  const payload = {
    company_id: companyId, document_type: input.documentType, document_number: documentNumber, document_date: input.documentDate,
    customer_id: input.documentType.startsWith("sale") ? partner.id : null,
    supplier_id: input.documentType.startsWith("purchase") ? partner.id : null,
    original_document_id: input.originalDocumentId || null, partner_name_snapshot: partner.name,
    partner_business_number_snapshot: partner.businessNumber, partner_representative_snapshot: partner.representative,
    partner_address_snapshot: partner.address, partner_contact_snapshot: partner.contact, memo: input.memo?.trim() || null,
    taxable_supply_amount: totals.taxableSupplyAmount, exempt_supply_amount: totals.exemptSupplyAmount,
    tax_amount: totals.taxAmount, total_amount: totals.totalAmount, created_by_user_id: actor.userId || null, created_by_name: actor.name,
  };
  let documentId = existing?.id;
  if (documentId) {
    await supabaseRequest(`business_documents?company_id=eq.${enc(companyId)}&id=eq.${enc(documentId)}`, { method: "PATCH", body: JSON.stringify(payload) });
    await supabaseRequest(`business_document_lines?company_id=eq.${enc(companyId)}&document_id=eq.${enc(documentId)}`, { method: "DELETE" });
  } else {
    const rows = await supabaseRequest<Array<{ id: string }>>("business_documents", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
    documentId = rows[0]?.id;
  }
  if (!documentId) throw new Error("전표를 저장하지 못했습니다.");
  const lineRows = input.lines.map((line, index) => {
    const amount = calculateErpLine({ quantity: line.quantity, unitPrice: line.unitPrice, taxType: line.taxType });
    return {
      company_id: companyId, document_id: documentId, sort_order: index + 1,
      product_catalog_id: line.productCatalogId || null, supplier_product_id: line.supplierProductId || null,
      product_code_snapshot: line.productCode?.trim() || null, product_name_snapshot: line.productName.trim(),
      specification_snapshot: line.specification?.trim() || null, unit_snapshot: line.unit.trim() || "EA",
      tax_type_snapshot: line.taxType, quantity: line.quantity, unit_price: Math.round(line.unitPrice), ...{
        supply_amount: amount.supplyAmount, tax_amount: amount.taxAmount, total_amount: amount.totalAmount,
      },
    };
  });
  try {
    await supabaseRequest("business_document_lines", { method: "POST", body: JSON.stringify(lineRows) });
  } catch (error) {
    throw new Error(`전표 품목 저장에 실패했습니다. 다시 저장해 주세요. (${error instanceof Error ? error.message : "알 수 없는 오류"})`);
  }
  return getBusinessDocument(companyId, documentId);
}

async function supabaseRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return supabaseRequest<T>(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

export async function confirmBusinessDocument(companyId: string, id: string, actor: ErpActor) {
  try {
    await supabaseRpc("confirm_business_document", { p_company_id: companyId, p_document_id: id, p_actor_user_id: actor.userId || null, p_actor_name: actor.name });
    return getBusinessDocument(companyId, id);
  } catch (error) { throw new Error(toKoreanErpError(error)); }
}
export async function cancelBusinessDocument(companyId: string, id: string, reason: string, actor: ErpActor) {
  if (!reason.trim()) throw new Error("취소 사유를 입력해 주세요.");
  try {
    await supabaseRpc("cancel_business_document", { p_company_id: companyId, p_document_id: id, p_actor_user_id: actor.userId || null, p_actor_name: actor.name, p_reason: reason.trim() });
    return getBusinessDocument(companyId, id);
  } catch (error) { throw new Error(toKoreanErpError(error)); }
}
export async function createReturnDraft(companyId: string, originalId: string, actor: ErpActor) {
  const original = await getBusinessDocument(companyId, originalId);
  if (original.status !== "confirmed" || !["sale", "purchase"].includes(original.documentType)) throw new Error("확정된 매출·매입 전표에서만 반품을 작성할 수 있습니다.");
  return saveBusinessDocument(companyId, {
    documentType: original.documentType === "sale" ? "sale_return" : "purchase_return",
    documentDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()),
    customerId: original.customerId, supplierId: original.supplierId, originalDocumentId: original.id,
    memo: `${original.documentNumber} 반품`, lines: original.lines.map((line) => ({ ...line })),
  }, actor);
}

export async function listErpOptions(companyId: string) {
  const [customers, suppliers, products, supplierProducts] = await Promise.all([
    supabaseRequest<Array<{ id: string; customer_name: string }>>(`normalized_customers?select=id,customer_name&company_id=eq.${enc(companyId)}&order=customer_name&limit=5000`),
    supabaseRequest<Array<{ id: string; name: string }>>(`product_suppliers?select=id,name&company_id=eq.${enc(companyId)}&is_active=eq.true&order=name&limit=1000`),
    supabaseRequest<Array<{ id: string; product_code: string | null; canonical_name: string | null; purchase_product_name: string; specification_value: string | null; specification_unit: string | null; sales_unit: string | null; tax_type: ErpTaxType | null; default_sales_price: number | null }>>(`product_catalog?select=id,product_code,canonical_name,purchase_product_name,specification_value,specification_unit,sales_unit,tax_type,default_sales_price&company_id=eq.${enc(companyId)}&is_active=eq.true&order=updated_at.desc&limit=5000`),
    supabaseRequest<Array<{ id: string; supplier_id: string; raw_name: string; raw_spec: string | null; raw_unit: string | null; latest_cost: number | null; parsed_tax_type: ErpTaxType | null }>>(`supplier_products?select=id,supplier_id,raw_name,raw_spec,raw_unit,latest_cost,parsed_tax_type&company_id=eq.${enc(companyId)}&order=updated_at.desc&limit=5000`),
  ]);
  return { customers: customers.map((x) => ({ id: x.id, name: x.customer_name })), suppliers, products, supplierProducts };
}

export async function getPartnerLedger(companyId: string, input: { partnerType: "customer" | "supplier"; partnerId: string; dateFrom: string; dateTo: string }) {
  const column = input.partnerType === "customer" ? "customer_id" : "supplier_id";
  const base = `company_id=eq.${enc(companyId)}&partner_type=eq.${input.partnerType}&${column}=eq.${enc(input.partnerId)}`;
  const [openingRows, rows] = await Promise.all([
    supabaseRequest<Array<{ amount: number }>>(`partner_ledger_entries?select=amount&${base}&entry_date=lt.${enc(input.dateFrom)}&limit=10000`),
    supabaseRequest<Array<{ id: string; entry_date: string; entry_type: string; amount: number; supply_amount: number; tax_amount: number; payment_method: string | null; memo: string | null; created_at: string; source_document_id: string | null }>>(`partner_ledger_entries?select=id,entry_date,entry_type,amount,supply_amount,tax_amount,payment_method,memo,created_at,source_document_id&${base}&entry_date=gte.${enc(input.dateFrom)}&entry_date=lte.${enc(input.dateTo)}&order=entry_date,created_at&limit=10000`),
  ]);
  const openingBalance = openingRows.reduce((sum, row) => sum + Number(row.amount), 0);
  let runningBalance = openingBalance;
  const entries = rows.map((row) => ({ ...row, amount: Number(row.amount), runningBalance: (runningBalance += Number(row.amount)) }));
  return { openingBalance, entries, closingBalance: runningBalance };
}

export async function recordPartnerPayment(companyId: string, input: { partnerType: "customer" | "supplier"; partnerId: string; entryDate: string; amount: number; paymentMethod: "cash" | "bank" | "card"; memo?: string; idempotencyKey?: string }, actor: ErpActor) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("입금·지급 금액을 확인해 주세요.");
  return supabaseRpc("record_partner_payment", { p_company_id: companyId, p_partner_type: input.partnerType, p_partner_id: input.partnerId, p_entry_date: input.entryDate, p_amount: Math.round(input.amount), p_payment_method: input.paymentMethod, p_idempotency_key: input.idempotencyKey || randomUUID(), p_actor_user_id: actor.userId || null, p_actor_name: actor.name, p_memo: input.memo?.trim() || null });
}

export function toKoreanErpError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/return total exceeds/i.test(message)) return "반품 합계가 원전표의 남은 금액을 초과합니다.";
  if (/cancel the confirmed return/i.test(message)) return "확정된 반품 전표를 먼저 취소해 주세요.";
  if (/only draft documents/i.test(message)) return "작성중 전표만 확정할 수 있습니다.";
  if (/document number year/i.test(message)) return "거래일 연도와 전표번호 연도가 달라 재저장이 필요합니다.";
  if (/erp_document_transition|status change/i.test(message)) return "전표 상태는 확정·취소 버튼으로만 변경할 수 있습니다.";
  if (/same type and partner/i.test(message)) return "반품은 같은 거래처의 확정 원전표에서만 작성할 수 있습니다.";
  return message || "전표를 처리하지 못했습니다.";
}
