import { isLeadContactActionType } from "../../domains/lead/contact-channels";
import { kstDateKey } from "../../domains/shared/kst-date";
import { getCompanyStaffInvitations, isMissingSalesQuoteSchemaError } from "../store";
import { isProductionStoreConfigured, supabaseRequest } from "./00-core";

const toKstDateKey = (iso: string): string => kstDateKey(iso);

export type SalesKpiSnapshot = {
  actualContacts: number;
  actualConversions: number;
  actualQuotes: number;
  periodMonth: string;
  targetContacts: number;
  targetConversions: number;
  targetQuotes: number;
};

export async function getSalesKpiSnapshot(companyId: string, staffUserId?: string, actorName?: string): Promise<SalesKpiSnapshot> {
  const periodMonth = new Date().toISOString().slice(0, 7);
  const periodStart = `${periodMonth}-01T00:00:00.000Z`;
  const fallback: SalesKpiSnapshot = { actualContacts: 0, actualConversions: 0, actualQuotes: 0, periodMonth, targetContacts: 0, targetConversions: 0, targetQuotes: 0 };
  if (!isProductionStoreConfigured()) return fallback;
  try {
    const targetKeys = [staffUserId, "__company__"].filter(Boolean) as string[];
    const targets = await supabaseRequest<Array<{ staff_user_id: string | null; target_contacts: number; target_conversions: number; target_quotes: number }>>(
      `sales_kpi_targets?select=staff_user_id,target_contacts,target_quotes,target_conversions&company_id=eq.${encodeURIComponent(companyId)}&period_month=eq.${periodMonth}-01&staff_user_id=in.(${targetKeys.map((key) => `"${key}"`).join(",")})`
    );
    const target = targets.find((row) => row.staff_user_id === staffUserId) || targets.find((row) => row.staff_user_id === "__company__");
    const actorFilter = actorName ? `&actor_name=eq.${encodeURIComponent(actorName)}` : "";
    const actions = await supabaseRequest<Array<{ action_type: string; result: string | null }>>(
      `lead_actions?select=action_type,result&company_id=eq.${encodeURIComponent(companyId)}&created_at=gte.${encodeURIComponent(periodStart)}${actorFilter}&limit=5000`
    );
    return {
      actualContacts: actions.filter((action) => isLeadContactActionType(action.action_type)).length,
      actualConversions: actions.filter((action) => action.action_type === "convert" || action.result === "거래처 전환").length,
      actualQuotes: actions.filter((action) => action.action_type === "quote").length,
      periodMonth,
      targetContacts: Number(target?.target_contacts) || 0,
      targetConversions: Number(target?.target_conversions) || 0,
      targetQuotes: Number(target?.target_quotes) || 0
    };
  } catch (error) {
    if (isMissingSalesQuoteSchemaError(error)) return fallback;
    throw error;
  }
}

export type CompanySalesKpiMember = SalesKpiSnapshot & {
  achievementRate: number;
  name: string;
  role: string;
  userId: string;
};

export async function getCompanySalesKpiOverview(companyId: string): Promise<{ members: CompanySalesKpiMember[]; periodMonth: string }> {
  const periodMonth = toKstDateKey(new Date().toISOString()).slice(0, 7);
  if (!isProductionStoreConfigured()) return { members: [], periodMonth };

  const { invitations } = await getCompanyStaffInvitations(companyId);
  const accepted = invitations.filter((invitation) => invitation.status === "accepted" && invitation.acceptedBy);
  if (!accepted.length) return { members: [], periodMonth };

  try {
    const periodStart = `${periodMonth}-01T00:00:00+09:00`;
    const [targets, actions] = await Promise.all([
      supabaseRequest<Array<{
        staff_user_id: string | null;
        target_contacts: number;
        target_conversions: number;
        target_quotes: number;
      }>>(
        `sales_kpi_targets?select=staff_user_id,target_contacts,target_quotes,target_conversions&company_id=eq.${encodeURIComponent(companyId)}&period_month=eq.${periodMonth}-01`
      ),
      supabaseRequest<Array<{ action_type: string; actor_name: string | null; result: string | null }>>(
        `lead_actions?select=action_type,actor_name,result&company_id=eq.${encodeURIComponent(companyId)}&created_at=gte.${encodeURIComponent(periodStart)}&limit=5000`
      )
    ]);
    const companyTarget = targets.find((target) => target.staff_user_id === "__company__");
    return {
      periodMonth,
      members: accepted.map((invitation) => {
        const userId = invitation.acceptedBy as string;
        const target = targets.find((row) => row.staff_user_id === userId) || companyTarget;
        const actorKeys = new Set(
          [invitation.employeeName, invitation.assignedManagerName]
            .map((value) => value?.trim().toLocaleLowerCase("ko-KR"))
            .filter(Boolean) as string[]
        );
        const memberActions = actions.filter((action) => {
          const actor = action.actor_name?.trim().toLocaleLowerCase("ko-KR");
          return Boolean(actor && actorKeys.has(actor));
        });
        const actualContacts = memberActions.filter((action) => isLeadContactActionType(action.action_type)).length;
        const actualQuotes = memberActions.filter((action) => action.action_type === "quote").length;
        const actualConversions = memberActions.filter((action) => action.action_type === "convert" || action.result === "거래처 전환").length;
        const targetContacts = Number(target?.target_contacts) || 0;
        const targetQuotes = Number(target?.target_quotes) || 0;
        const targetConversions = Number(target?.target_conversions) || 0;
        const weightedTarget = targetContacts + targetQuotes + targetConversions;
        const weightedActual = Math.min(actualContacts, targetContacts) + Math.min(actualQuotes, targetQuotes) + Math.min(actualConversions, targetConversions);
        return {
          achievementRate: weightedTarget ? Math.min(100, Math.round((weightedActual / weightedTarget) * 100)) : 0,
          actualContacts,
          actualConversions,
          actualQuotes,
          name: invitation.employeeName,
          periodMonth,
          role: invitation.role,
          targetContacts,
          targetConversions,
          targetQuotes,
          userId
        };
      }).sort((left, right) => right.achievementRate - left.achievementRate || left.name.localeCompare(right.name, "ko-KR"))
    };
  } catch (error) {
    if (isMissingSalesQuoteSchemaError(error)) return { members: [], periodMonth };
    throw error;
  }
}

export async function updateCompanySalesKpiTarget(companyId: string, input: { targetContacts: number; targetConversions: number; targetQuotes: number }) {
  const periodMonth = `${new Date().toISOString().slice(0, 7)}-01`;
  try {
    const rows = await supabaseRequest<Array<{ target_contacts: number; target_conversions: number; target_quotes: number }>>(
      "sales_kpi_targets?on_conflict=company_id,staff_user_id,period_month",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify([{
          company_id: companyId,
          period_month: periodMonth,
          staff_name: "회사 공통 목표",
          staff_user_id: "__company__",
          target_contacts: input.targetContacts,
          target_conversions: input.targetConversions,
          target_quotes: input.targetQuotes
        }])
      }
    );
    return rows[0];
  } catch (error) {
    if (isMissingSalesQuoteSchemaError(error)) throw new Error("영업 KPI SQL이 아직 적용되지 않았습니다. 견적·영업 운영 SQL을 먼저 실행해주세요.");
    throw error;
  }
}
