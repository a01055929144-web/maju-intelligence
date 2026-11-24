import type { ColumnMapping, ExcelMappingPreset } from "../store";
import { getDefaultCompanyId, isProductionStoreConfigured, supabaseRequest } from "./00-core";
import { upsertCompany } from "./00-supabase-helpers";

export async function getExcelMappingPreset(
  uploadType: "customer-master" | "sales-analysis",
  companyId?: string,
  presetName = "default"
): Promise<{ persisted: boolean; preset: ExcelMappingPreset | null }> {
  const id = companyId || getDefaultCompanyId();
  if (!isProductionStoreConfigured()) return { persisted: false, preset: null };

  const rows = await supabaseRequest<
    Array<{
      id: string;
      company_id: string;
      erp_name: string | null;
      mapping: ColumnMapping | null;
      preset_name: string;
      upload_type: "customer-master" | "sales-analysis";
      updated_at: string;
    }>
  >(
    `excel_mapping_presets?select=id,company_id,upload_type,preset_name,erp_name,mapping,updated_at&company_id=eq.${encodeURIComponent(
      id
    )}&upload_type=eq.${encodeURIComponent(uploadType)}&preset_name=eq.${encodeURIComponent(presetName)}&limit=1`
  );

  const row = rows[0];
  if (!row) return { persisted: true, preset: null };

  return {
    persisted: true,
    preset: {
      id: row.id,
      companyId: row.company_id,
      erpName: row.erp_name || undefined,
      mapping: row.mapping || {},
      presetName: row.preset_name,
      uploadType: row.upload_type,
      updatedAt: row.updated_at
    }
  };
}

export async function upsertExcelMappingPreset(input: {
  companyId?: string;
  erpName?: string;
  mapping: ColumnMapping;
  presetName?: string;
  uploadType: "customer-master" | "sales-analysis";
}): Promise<{ persisted: boolean; preset: ExcelMappingPreset }> {
  const companyId = input.companyId || getDefaultCompanyId();
  const presetName = input.presetName || "default";
  const preset: ExcelMappingPreset = {
    companyId,
    erpName: input.erpName,
    mapping: input.mapping,
    presetName,
    uploadType: input.uploadType
  };

  if (!isProductionStoreConfigured()) return { persisted: false, preset };

  await upsertCompany(companyId, "마주식자재");
  const rows = await supabaseRequest<
    Array<{
      id: string;
      company_id: string;
      erp_name: string | null;
      mapping: ColumnMapping | null;
      preset_name: string;
      upload_type: "customer-master" | "sales-analysis";
      updated_at: string;
    }>
  >("excel_mapping_presets?on_conflict=company_id,upload_type,preset_name", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        company_id: companyId,
        erp_name: input.erpName || null,
        mapping: input.mapping,
        preset_name: presetName,
        upload_type: input.uploadType,
        updated_at: new Date().toISOString()
      }
    ])
  });
  const row = rows[0];

  return {
    persisted: true,
    preset: {
      id: row.id,
      companyId: row.company_id,
      erpName: row.erp_name || undefined,
      mapping: row.mapping || {},
      presetName: row.preset_name,
      uploadType: row.upload_type,
      updatedAt: row.updated_at
    }
  };
}

export async function deleteExcelMappingPreset(
  uploadType: "customer-master" | "sales-analysis",
  companyId?: string,
  presetName = "default"
): Promise<{ persisted: boolean }> {
  const id = companyId || getDefaultCompanyId();
  if (!isProductionStoreConfigured()) return { persisted: false };

  await supabaseRequest(
    `excel_mapping_presets?company_id=eq.${encodeURIComponent(id)}&upload_type=eq.${encodeURIComponent(uploadType)}&preset_name=eq.${encodeURIComponent(presetName)}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal"
      }
    }
  );

  return { persisted: true };
}
