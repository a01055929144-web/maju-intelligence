import { getDefaultCompanyId, isProductionStoreConfigured, supabaseRequest } from "./00-core";

export type CustomerMessageLogItem = {
  attachmentId?: string;
  id: string;
  channel: string;
  createdAt: string;
  errorMessage?: string;
  messageBody: string;
  provider?: string;
  recipientName?: string;
  recipientPhone?: string;
  sentAt?: string;
  status: "failed" | "queued" | "sent";
  triggerType: string;
  noteId?: string;
};

export type CustomerMessageLogRow = {
  attachment_id?: string | null;
  id: string;
  channel: string;
  created_at: string;
  error_message: string | null;
  message_body: string;
  provider: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  sent_at: string | null;
  status: "failed" | "queued" | "sent";
  trigger_type: string;
  note_id?: string | null;
};

export function isMissingCustomerMessageLogsTableError(error: unknown) {
  return error instanceof Error && error.message.includes("customer_message_logs");
}

export function toCustomerMessageLogItem(row: CustomerMessageLogRow): CustomerMessageLogItem {
  return {
    attachmentId: row.attachment_id || undefined,
    id: row.id,
    channel: row.channel,
    createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    errorMessage: row.error_message || undefined,
    messageBody: row.message_body,
    provider: row.provider || undefined,
    recipientName: row.recipient_name || undefined,
    recipientPhone: row.recipient_phone || undefined,
    sentAt: row.sent_at ? new Date(row.sent_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : undefined,
    status: row.status,
    triggerType: row.trigger_type,
    noteId: row.note_id || undefined
  };
}

export async function getCustomerMessageLogs(customerId: string, companyId?: string): Promise<CustomerMessageLogItem[]> {
  const id = companyId || getDefaultCompanyId();
  if (!isProductionStoreConfigured() || customerId.startsWith("sample-") || customerId.startsWith("local-")) return [];
  try {
    const rows = await supabaseRequest<CustomerMessageLogRow[]>(
      `customer_message_logs?select=id,attachment_id,note_id,channel,created_at,error_message,message_body,provider,recipient_name,recipient_phone,sent_at,status,trigger_type&company_id=eq.${encodeURIComponent(id)}&customer_id=eq.${encodeURIComponent(customerId)}&order=created_at.desc&limit=20`
    );
    return rows.map(toCustomerMessageLogItem);
  } catch (error) {
    if (isMissingCustomerMessageLogsTableError(error)) return [];
    throw error;
  }
}
