import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { supabaseRequest } from "@/lib/store";
import { validateDeliveryPolicy, type DeliveryPolicy } from "@/domains/order/order-rules";

export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
}

function sameOrigin(request: NextRequest) {
  const raw = request.headers.get("origin");
  if (!raw) return true;
  try {
    const origin = new URL(raw);
    return ["http:", "https:"].includes(origin.protocol) &&
      origin.host.toLowerCase() === (request.headers.get("host") || request.nextUrl.host).toLowerCase();
  } catch { return false; }
}

function integer(value: unknown, label: string, maximum = 1e12): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new Error(`${label}을 확인해 주세요.`);
  return value;
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || value.length > max) throw new Error(`${label}을 확인해 주세요.`);
  return value.trim();
}

function uuid(value: unknown) {
  if (typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new Error("선택한 거래처 또는 권역을 확인해 주세요.");
  return value;
}

function parsePolicy(input: Record<string, unknown>, requiredWeekdays: boolean) {
  const days = input.weekdays === null && !requiredWeekdays ? null : input.weekdays;
  if (requiredWeekdays && days === null) throw new Error("배송 요일을 선택해 주세요.");
  if (days !== null && (!Array.isArray(days) || days.length < 1 || days.length > 7 ||
    !days.every((value) => Number.isInteger(value) && value >= 0 && value <= 6) ||
    new Set(days).size !== days.length))
    throw new Error("배송 요일을 확인해 주세요.");
  const before = input.cutoffDaysBefore === null ? null : integer(input.cutoffDaysBefore, "마감일", 2);
  const cutoff = input.cutoffTime === null ? null : text(input.cutoffTime, "마감 시각", 5);
  if (cutoff !== null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cutoff))
    throw new Error("마감 시각을 확인해 주세요.");
  const minimum = input.minimumAmount === null ? null : integer(input.minimumAmount, "최소 주문금액");
  const policy = input.minimumPolicy === null ? null : input.minimumPolicy;
  if (policy !== null && !["block", "fee", "notice"].includes(String(policy)))
    throw new Error("최소 주문 처리 방식을 확인해 주세요.");
  const fee = input.deliveryFee === null ? null : integer(input.deliveryFee, "배송비");
  if (requiredWeekdays) {
    validateDeliveryPolicy({
      weekdays: days as number[],
      cutoffDaysBefore: (before ?? 1) as DeliveryPolicy["cutoffDaysBefore"],
      cutoffTime: cutoff ?? "22:00",
      minimumAmount: minimum ?? 0,
      minimumPolicy: (policy ?? "notice") as DeliveryPolicy["minimumPolicy"],
      deliveryFee: fee ?? 0,
      holidays: [],
    });
  }
  return { delivery_weekdays: days, cutoff_days_before: before,
    cutoff_time: cutoff, minimum_amount: minimum, minimum_policy: policy,
    delivery_fee: fee };
}

async function authorize(request: NextRequest, write: boolean, companyId?: string) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) return unavailable();
  if (write && !sameOrigin(request))
    return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });
  const auth = await getRequestAuthScope(request, companyId);
  if (!auth.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!auth.companyId || !areHoldModulesEnabled(auth.companyId)) return unavailable();
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession))
    return NextResponse.json({ message: "설정 권한이 없습니다." }, { status: 403 });
  return auth.companyId;
}

export async function GET(request: NextRequest) {
  const scope = await authorize(request, false, request.nextUrl.searchParams.get("companyId") || undefined);
  if (typeof scope !== "string") return scope;
  const company = encodeURIComponent(scope);
  try {
    const customerId = request.nextUrl.searchParams.get("customerId");
    if (customerId) {
      const id = uuid(customerId);
      const rows = await supabaseRequest<Record<string, unknown>[]>(
        `store_order_customer_rules?company_id=eq.${company}&customer_id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      );
      return NextResponse.json({ rule: rows[0] ?? null }, { headers: { "Cache-Control": "no-store" } });
    }
    const customerQuery = request.nextUrl.searchParams.get("customerQuery")?.trim();
    if (customerQuery) {
      if (customerQuery.length < 2 || customerQuery.length > 50 || /[%*,()]/.test(customerQuery))
        return NextResponse.json({ message: "거래처 이름을 두 글자 이상 입력해 주세요." }, { status: 400 });
      const customers = await supabaseRequest<Record<string, unknown>[]>(
        `normalized_customers?company_id=eq.${company}&customer_name=ilike.*${encodeURIComponent(customerQuery)}*&select=id,customer_name,delivery_territory_id&order=customer_name.asc&limit=30`,
      );
      return NextResponse.json({ customers }, { headers: { "Cache-Control": "no-store" } });
    }
    const [settings, territories, territoryRules, holidays] = await Promise.all([
      supabaseRequest<Record<string, unknown>[]>(`store_order_settings?company_id=eq.${company}&select=*`),
      supabaseRequest<Record<string, unknown>[]>(`delivery_territories?company_id=eq.${company}&select=id,name,is_active&order=name.asc&limit=100`),
      supabaseRequest<Record<string, unknown>[]>(`store_order_territory_rules?company_id=eq.${company}&select=*`),
      supabaseRequest<Record<string, unknown>[]>(`store_order_holidays?company_id=eq.${company}&select=*&order=holiday_date.asc.nullslast&limit=200`),
    ]);
    return NextResponse.json({ settings: settings[0] ?? null, territories, territoryRules,
      holidays }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "주문 설정을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ message: "입력값을 확인해 주세요." }, { status: 400 }); }
  const scope = await authorize(request, true, typeof body.companyId === "string" ? body.companyId : undefined);
  if (typeof scope !== "string") return scope;
  try {
    let path = "";
    let payload: Record<string, unknown>;
    if (body.action === "company") {
      const cutoffDays = integer(body.cutoffDaysBefore, "마감일", 2);
      const cutoffTime = text(body.cutoffTime, "마감 시각", 5);
      const minimum = integer(body.minimumAmount, "최소 주문금액");
      const fee = integer(body.deliveryFee, "배송비");
      const mode = body.minimumPolicy;
      validateDeliveryPolicy({ weekdays: [1], cutoffDaysBefore: cutoffDays as 0 | 1 | 2,
        cutoffTime, minimumAmount: minimum,
        minimumPolicy: mode as DeliveryPolicy["minimumPolicy"], deliveryFee: fee, holidays: [] });
      path = "store_order_settings?on_conflict=company_id";
      payload = { company_id: scope, cutoff_days_before: cutoffDays, cutoff_time: cutoffTime,
        minimum_amount: minimum, minimum_policy: mode, delivery_fee: fee,
        payment_mode: "postpay", notice: text(body.notice, "공지", 500),
        market_price_notice: text(body.marketPriceNotice, "시세 안내", 300) };
    } else if (body.action === "territory") {
      path = "store_order_territory_rules?on_conflict=company_id,territory_id";
      payload = { company_id: scope, territory_id: uuid(body.territoryId), ...parsePolicy(body, true) };
    } else if (body.action === "customer") {
      path = "store_order_customer_rules?on_conflict=company_id,customer_id";
      payload = { company_id: scope, customer_id: uuid(body.customerId), ...parsePolicy(body, false),
        payment_mode: "postpay" };
    } else if (body.action === "holiday") {
      const kind = body.kind;
      if (!["weekly", "fixed", "date"].includes(String(kind))) throw new Error("휴일 종류를 확인해 주세요.");
      path = "store_order_holidays";
      if (kind === "date") {
        const value = text(body.date, "날짜", 10);
        const parsed = new Date(`${value}T00:00:00.000Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== value) throw new Error("휴일 날짜를 확인해 주세요.");
      }
      payload = { company_id: scope,
        territory_id: body.territoryId ? uuid(body.territoryId) : null,
        kind, weekday: kind === "weekly" ? integer(body.weekday, "요일", 6) : null,
        month: kind === "fixed" ? integer(body.month, "월", 12) : null,
        day: kind === "fixed" ? integer(body.day, "일", 31) : null,
        holiday_date: kind === "date" ? text(body.date, "날짜", 10) : null,
        source: "manual", label: text(body.label, "휴일 이름", 80) };
    } else throw new Error("저장 요청을 확인해 주세요.");
    const rows = await supabaseRequest<Record<string, unknown>[]>(path, {
      method: "POST", headers: { Prefer: body.action === "holiday" ? "return=representation" : "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(payload),
    });
    return NextResponse.json({ result: rows?.[0] ?? null });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error && !error.message.startsWith("Supabase request failed")
      ? error.message : "주문 설정을 저장하지 못했습니다. 매장·권역과 입력값을 확인해 주세요." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const scope = await authorize(request, true, request.nextUrl.searchParams.get("companyId") || undefined);
  if (typeof scope !== "string") return scope;
  try {
    const id = uuid(request.nextUrl.searchParams.get("holidayId"));
    await supabaseRequest(`store_order_holidays?company_id=eq.${encodeURIComponent(scope)}&id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE", headers: { Prefer: "return=minimal" },
    });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ message: "휴일을 삭제하지 못했습니다." }, { status: 400 });
  }
}
