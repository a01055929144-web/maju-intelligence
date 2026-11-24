import type { DatabaseCheck } from "../store";
import { getErrorMessage, isMissingSalesQuoteSchemaError } from "../store";
import { getDefaultCompanyId, getSupabaseConfig, supabaseRequest } from "./00-core";
import { isMissingColumnError, isMissingCustomerPlaceLinksColumnError, isMissingDeliveryIdempotencyColumnError, supabaseStorageRequest } from "./00-supabase-helpers";

export async function countTableRows(table: string, name: string, description: string, countColumn = "id"): Promise<DatabaseCheck> {
  try {
    const count = await supabaseCount(table, countColumn);
    return {
      name,
      status: "ready",
      count,
      description
    };
  } catch (error) {
    return {
      name,
      status: "missing",
      count: null,
      description: `${description} ${getErrorMessage(error)}`
    };
  }
}

export async function checkDefaultCompany(): Promise<DatabaseCheck> {
  try {
    const rows = await supabaseRequest<Array<{ id: string }>>(
      `companies?select=id&id=eq.${encodeURIComponent(getDefaultCompanyId())}&limit=1`
    );

    return {
      name: "기본 고객사 연결",
      status: rows.length ? "ready" : "missing",
      count: rows.length,
      description: rows.length
        ? "CUSTOMER_COMPANY_ID와 Supabase companies.id가 연결되어 있습니다."
        : "관리자 > 고객사 관리에서 기본 로그인 대상으로 사용할 회사 ID를 복사한 뒤, Vercel Production의 CUSTOMER_COMPANY_ID에 저장하고 재배포하세요. 기존 고객사 데이터는 변경하지 않습니다."
    };
  } catch (error) {
    return {
      name: "기본 고객사 연결",
      status: "missing",
      count: null,
      description: getErrorMessage(error)
    };
  }
}

export async function checkCustomerPlaceLinkColumns(): Promise<DatabaseCheck> {
  try {
    await supabaseRequest<Array<Record<string, unknown>>>("normalized_customers?select=naver_place_url,kakao_place_url,google_map_url,place_links_checked_at&limit=1");

    return {
      name: "매장 외부 링크 컬럼",
      status: "ready",
      count: null,
      description: "네이버 플레이스, 카카오맵, 구글맵 링크 저장 컬럼이 적용되어 있습니다."
    };
  } catch (error) {
    return {
      name: "매장 외부 링크 컬럼",
      status: "missing",
      count: null,
      description: isMissingCustomerPlaceLinksColumnError(error)
        ? "20260725_customer_place_links.sql 마이그레이션을 Supabase SQL Editor에서 실행해야 링크가 서버에 저장됩니다."
        : getErrorMessage(error)
    };
  }
}

export async function checkCustomerGradeOverrideSchema(): Promise<DatabaseCheck> {
  try {
    await supabaseRequest<Array<{ grade_override: string | null }>>(
      "normalized_customers?select=grade_override&limit=1"
    );

    return {
      name: "거래처 수동 등급 저장",
      status: "ready",
      count: null,
      description: "거래처별 A/B/C 수동 등급과 매출 자동 등급 복귀 컬럼이 적용되어 있습니다."
    };
  } catch (error) {
    return {
      name: "거래처 수동 등급 저장",
      status: "missing",
      count: null,
      description: isMissingColumnError(error)
        ? "supabase/migrations/20261008_customer_grade_override.sql을 Supabase SQL Editor에서 실행해야 등급 변경이 유지됩니다."
        : getErrorMessage(error)
    };
  }
}

export async function checkSalesQuoteOperationsSchema(): Promise<DatabaseCheck> {
  try {
    await Promise.all([
      supabaseRequest<Array<Record<string, unknown>>>(
        "companies?select=default_quote_margin_percent,default_quote_valid_days&limit=1"
      ),
      supabaseRequest<Array<Record<string, unknown>>>(
        "lead_actions?select=collateral_types,follow_up_at,metadata&limit=1"
      ),
      supabaseRequest<Array<Record<string, unknown>>>(
        "product_catalog?select=id,company_id,match_status&limit=1"
      ),
      supabaseRequest<Array<Record<string, unknown>>>(
        "sales_quotes?select=id,company_id,public_token,public_enabled,valid_until&limit=1"
      ),
      supabaseRequest<Array<Record<string, unknown>>>(
        "sales_quote_items?select=id,company_id,quote_id,purchase_unit_price,sales_unit_price&limit=1"
      ),
      supabaseRequest<Array<Record<string, unknown>>>(
        "sales_kpi_targets?select=id,company_id,period_month&limit=1"
      ),
      supabaseRequest<Array<Record<string, unknown>>>(
        "delivery_notification_jobs?select=id,company_id,status,attempt_count&limit=1"
      )
    ]);

    return {
      name: "영업 견적·KPI 운영 스키마",
      status: "ready",
      count: null,
      description: "상품 매칭, 견적/공개 링크, 영업 KPI, 배송 알림 재시도 저장소가 적용되어 있습니다."
    };
  } catch (error) {
    return {
      name: "영업 견적·KPI 운영 스키마",
      status: "missing",
      count: null,
      description: isMissingColumnError(error) || isMissingSalesQuoteSchemaError(error)
        ? "supabase/migrations/20261009012401_sales_quote_operations.sql을 Supabase SQL Editor에서 실행해야 영업·견적 저장 기능이 동작합니다."
        : getErrorMessage(error)
    };
  }
}

export async function checkDeliveryProofIdempotencySchema(): Promise<DatabaseCheck> {
  try {
    await Promise.all([
      supabaseRequest<Array<{ idempotency_key: string | null }>>(
        "customer_notes?select=idempotency_key&limit=1"
      ),
      supabaseRequest<Array<{ idempotency_key: string | null }>>(
        "customer_attachments?select=idempotency_key&limit=1"
      ),
      supabaseRequest<Array<{ idempotency_key: string | null }>>(
        "customer_message_logs?select=idempotency_key&limit=1"
      )
    ]);

    return {
      name: "배송완료 재시도 중복 방지",
      status: "ready",
      count: null,
      description: "배송 메모·사진·알림에 재시도 식별자가 적용되어 부분 실패 후 다시 눌러도 중복 저장되지 않습니다."
    };
  } catch (error) {
    return {
      name: "배송완료 재시도 중복 방지",
      status: "missing",
      count: null,
      description: isMissingDeliveryIdempotencyColumnError(error)
        ? "supabase/migrations/20261010_delivery_proof_idempotency.sql을 Supabase SQL Editor에서 실행해야 배송완료 재시도 중복 방지가 활성화됩니다. 적용 전에도 기존 저장은 정상 동작합니다."
        : getErrorMessage(error)
    };
  }
}

export async function checkVisitLeadRelationship(): Promise<DatabaseCheck> {
  try {
    await supabaseRequest<Array<Record<string, unknown>>>(
      "visit_results?select=id,lead_recommendations(id)&limit=1"
    );

    return {
      name: "방문 결과 ↔ 추천 리드 연결",
      status: "ready",
      count: null,
      description: "visit_results.lead_id와 lead_recommendations 간 외래키가 정상적으로 연결되어 있습니다."
    };
  } catch (error) {
    const message = getErrorMessage(error);
    const isRelationshipMissing = message.includes("PGRST200") || message.includes("relationship");
    return {
      name: "방문 결과 ↔ 추천 리드 연결",
      status: "missing",
      count: null,
      description: isRelationshipMissing
        ? "supabase/migrations/20260814_visit_results_lead_fk.sql 마이그레이션을 실행해야 방문 히스토리에서 추천 리드 정보가 정상 조회됩니다."
        : message
    };
  }
}

export async function checkStorageBucket(bucketId: string, name: string, description: string): Promise<DatabaseCheck> {
  try {
    const bucket = await supabaseStorageRequest<{ id: string; name: string; public: boolean }>(`bucket/${encodeURIComponent(bucketId)}`);
    return {
      name,
      status: "ready",
      count: null,
      description: `${description} 현재 ${bucket.public ? "공개" : "비공개"} 버킷으로 설정되어 있습니다.`
    };
  } catch (error) {
    return {
      name,
      status: "missing",
      count: null,
      description: `${description} ${getErrorMessage(error)}`
    };
  }
}

async function supabaseCount(table: string, countColumn = "id") {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const response = await fetch(`${config.url}/rest/v1/${table}?select=${encodeURIComponent(countColumn)}&limit=1`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Prefer: "count=exact"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`조회 실패: ${response.status} ${message}`);
  }

  const contentRange = response.headers.get("content-range");
  const count = Number(contentRange?.split("/")[1]);
  return Number.isFinite(count) ? count : 0;
}
