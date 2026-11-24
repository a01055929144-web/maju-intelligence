import { isMissingColumnError } from "./00-supabase-helpers";
import { isProductionStoreConfigured, supabaseRequest } from "./00-core";

export type CustomerContactItem = {
  id: string;
  customerId: string;
  birthDate?: string;
  isPrimary: boolean;
  memo?: string;
  name: string;
  phone?: string;
  role: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type CustomerContactRow = {
  id: string;
  customer_id: string;
  role: string;
  name: string;
  phone: string | null;
  memo: string | null;
  birth_date?: string | null;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function toCustomerContactItem(row: CustomerContactRow): CustomerContactItem {
  return {
    id: row.id,
    customerId: row.customer_id,
    birthDate: row.birth_date || undefined,
    isPrimary: row.is_primary,
    memo: row.memo || undefined,
    name: row.name,
    phone: row.phone || undefined,
    role: row.role,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isMissingCustomerContactsTableError(error: unknown) {
  return error instanceof Error && error.message.includes("customer_contacts");
}

export async function listCustomerContacts(companyId: string, customerId: string): Promise<CustomerContactItem[]> {
  if (!isProductionStoreConfigured()) return [];
  try {
    const rows = await supabaseRequest<CustomerContactRow[]>(
      `customer_contacts?select=*&company_id=eq.${encodeURIComponent(companyId)}&customer_id=eq.${encodeURIComponent(customerId)}&order=sort_order.asc,created_at.asc`
    );
    return rows.map(toCustomerContactItem);
  } catch (error) {
    if (isMissingCustomerContactsTableError(error)) return [];
    throw error;
  }
}

export type CustomerContactInput = {
  id?: string;
  birthDate?: string;
  isPrimary?: boolean;
  memo?: string;
  name: string;
  phone?: string;
  role: string;
};

export async function upsertCustomerContact(
  companyId: string,
  customerId: string,
  input: CustomerContactInput
): Promise<{ contact: CustomerContactItem | null; ok: boolean; message?: string }> {
  if (!isProductionStoreConfigured()) return { contact: null, ok: false, message: "데이터베이스가 연결되어 있지 않습니다." };
  if (!input.name.trim()) return { contact: null, ok: false, message: "담당자 이름은 필수입니다." };

  const basePayload = {
    company_id: companyId,
    customer_id: customerId,
    role: input.role.trim() || "담당자",
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    memo: input.memo?.trim() || null,
    is_primary: Boolean(input.isPrimary),
    updated_at: new Date().toISOString()
  };
  // birth_date는 20260818c 마이그레이션으로 추가된 컬럼입니다. 아직 마이그레이션을 실행하지 않은
  // 환경에서도 나머지 연락처 저장 기능(이름/직책/전화/메모)이 함께 깨지지 않도록, 컬럼이 없다는
  // 오류(PGRST204/schema cache)를 만나면 이 필드만 빼고 한 번 더 시도합니다.
  const payloadWithBirthDate = { ...basePayload, birth_date: input.birthDate?.trim() || null };

  async function runUpsert(payload: Record<string, unknown>) {
    if (input.id) {
      return supabaseRequest<CustomerContactRow[]>(
        `customer_contacts?id=eq.${encodeURIComponent(input.id!)}&company_id=eq.${encodeURIComponent(companyId)}`,
        { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) }
      );
    }
    return supabaseRequest<CustomerContactRow[]>("customer_contacts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([payload])
    });
  }

  try {
    let rows: CustomerContactRow[];
    let birthDateSaved = true;
    try {
      rows = await runUpsert(payloadWithBirthDate);
    } catch (error) {
      if (!isMissingColumnError(error) || !input.birthDate?.trim()) throw error;
      birthDateSaved = false;
      rows = await runUpsert(basePayload);
    }
    return {
      contact: rows[0] ? toCustomerContactItem(rows[0]) : null,
      ok: true,
      message: birthDateSaved ? undefined : "생일 항목은 아직 저장되지 않았습니다 — 관리자가 마이그레이션을 실행해야 합니다."
    };
  } catch (error) {
    if (isMissingCustomerContactsTableError(error)) {
      return { contact: null, ok: false, message: "연락처 저장소가 아직 준비되지 않았습니다. 마이그레이션을 먼저 실행해주세요." };
    }
    throw error;
  }
}

export async function deleteCustomerContact(companyId: string, contactId: string): Promise<{ ok: boolean }> {
  if (!isProductionStoreConfigured()) return { ok: false };
  await supabaseRequest(`customer_contacts?id=eq.${encodeURIComponent(contactId)}&company_id=eq.${encodeURIComponent(companyId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  }).catch((error) => {
    if (!isMissingCustomerContactsTableError(error)) throw error;
  });
  return { ok: true };
}
