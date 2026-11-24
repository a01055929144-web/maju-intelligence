import { encodeStoragePath, sanitizeStorageFilename } from "../../domains/organization/storage-path";
import { addCustomerAttachment, CUSTOMER_ATTACHMENT_BUCKET, toCustomerAttachmentItem } from "../store";
import { getDefaultCompanyId, getSupabaseConfig, isProductionStoreConfigured, supabaseRequest } from "./00-core";
import { isMissingDeliveryIdempotencyColumnError, supabaseStorageRequest } from "./00-supabase-helpers";

export async function uploadCustomerAttachmentFile(
  input: {
    attachmentType: string;
    bytes: ArrayBuffer;
    companyId?: string;
    contentType: string;
    createdByName?: string;
    customerId: string;
    filename: string;
    idempotencyKey?: string;
    title: string;
  }
) {
  const companyId = input.companyId || getDefaultCompanyId();
  const title = input.title.trim() || input.filename;

  if (!isProductionStoreConfigured() || input.customerId.startsWith("sample-") || input.customerId.startsWith("local-")) {
    return {
      attachment: {
        id: `local-upload-${Date.now()}`,
        attachmentType: input.attachmentType || "etc",
        createdAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
        fileUrl: "",
        mimeType: input.contentType,
        storagePath: undefined,
        title
      },
      persisted: false,
      uploaded: false
    };
  }

  if (input.idempotencyKey) {
    const existing = await supabaseRequest<Array<{ id: string; attachment_type: string; created_at: string; file_url: string | null; mime_type: string | null; storage_path: string | null; title: string }>>(
      `customer_attachments?select=id,attachment_type,created_at,file_url,mime_type,storage_path,title&company_id=eq.${encodeURIComponent(companyId)}&customer_id=eq.${encodeURIComponent(input.customerId)}&idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}&limit=1`
    ).catch((error) => {
      if (isMissingDeliveryIdempotencyColumnError(error)) return [];
      throw error;
    });
    if (existing[0]) return { attachment: toCustomerAttachmentItem(existing[0]), persisted: true, reused: true, uploaded: true };
  }
  const stablePrefix = input.idempotencyKey ? sanitizeStorageFilename(input.idempotencyKey) : String(Date.now());
  const storagePath = `${companyId}/${input.customerId}/${stablePrefix}-${sanitizeStorageFilename(input.filename)}`;
  await supabaseStorageRequest(`object/${CUSTOMER_ATTACHMENT_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      "Content-Type": input.contentType || "application/octet-stream",
      "x-upsert": "true"
    },
    body: input.bytes
  });

  const result = await addCustomerAttachment(
    {
      attachmentType: input.attachmentType || "etc",
      createdByName: input.createdByName,
      customerId: input.customerId,
      idempotencyKey: input.idempotencyKey,
      fileUrl: `/api/customer-attachments/file?path=${encodeURIComponent(storagePath)}`,
      mimeType: input.contentType,
      storagePath,
      title
    },
    companyId
  );

  return {
    ...result,
    uploaded: true
  };
}

export async function createCustomerAttachmentSignedUrl(storagePath: string, expiresInSeconds = 60 * 10) {
  if (!isProductionStoreConfigured()) throw new Error("Supabase is not configured.");
  const cleanPath = storagePath.replace(/^\/+/, "");
  const result = await supabaseStorageRequest<{ signedURL: string }>(
    `object/sign/${CUSTOMER_ATTACHMENT_BUCKET}/${encodeStoragePath(cleanPath)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ expiresIn: Math.max(60, Math.min(expiresInSeconds, 7 * 24 * 60 * 60)) })
    }
  );

  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return result.signedURL.startsWith("http") ? result.signedURL : `${config.url}/storage/v1${result.signedURL}`;
}

export async function getCustomerAttachmentOwnerByStoragePath(companyId: string, storagePath: string): Promise<{
  attachmentId: string;
  attachmentType: string;
  customerId: string;
} | null> {
  if (!companyId || !storagePath || !isProductionStoreConfigured()) return null;

  const rows = await supabaseRequest<Array<{ attachment_type: string; customer_id: string; id: string }>>(
    `customer_attachments?select=id,customer_id,attachment_type&company_id=eq.${encodeURIComponent(companyId)}&storage_path=eq.${encodeURIComponent(storagePath)}&limit=1`
  );

  const row = rows[0];
  return row ? { attachmentId: row.id, attachmentType: row.attachment_type, customerId: row.customer_id } : null;
}
