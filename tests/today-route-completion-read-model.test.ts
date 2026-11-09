import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTodayRouteCompletionReadModel } from "../application/route/today-route-completion-read-model";
import type { RoutePlan } from "../lib/store";

const companyId = "00000000-0000-4000-8000-000000000001";
const customerId = "20000000-0000-4000-8000-000000000001";
const orderId = "30000000-0000-4000-8000-000000000001";
const eventId = "40000000-0000-4000-8000-000000000001";
const noteId = "50000000-0000-4000-8000-000000000001";
const attachmentId = "60000000-0000-4000-8000-000000000001";
const routePlan: RoutePlan = {
  groups: [{ region: "서울", stops: [{ id: customerId, name: "기존 정류장", region: "서울", score: 80, status: "today", expectedRevenue: 10, order: 1 }], expectedRevenue: 10, totalDistanceKm: 1, totalDurationMinutes: 10 }],
  source: "supabase",
  totalDistanceKm: 1,
  totalDurationMinutes: 10,
  totalExpectedRevenue: 10,
  totalStops: 1
};

afterEach(() => vi.unstubAllEnvs());

function repository(options: { mismatch?: boolean; schemaError?: boolean } = {}) {
  return vi.fn(async <T>(path: string): Promise<T> => {
    if (options.schemaError) throw new Error("relation does not exist");
    if (path.startsWith("store_orders")) return [{ id: orderId, customer_id: customerId, delivery_date: "2026-11-09", revision: 4 }] as T;
    if (path.startsWith("store_order_delivery_completion_orders_09")) return [{ completion_event_id: eventId, order_id: orderId, completed_revision: options.mismatch ? 5 : 4 }] as T;
    if (path.startsWith("store_order_delivery_completions_09")) return [{ completion_event_id: eventId, customer_id: customerId, completed_at: "2026-11-09T03:00:00Z", note_id: noteId }] as T;
    if (path.startsWith("store_order_delivery_completion_attachments_09")) return [{ completion_event_id: eventId, customer_id: customerId, attachment_id: attachmentId }] as T;
    throw new Error(`unexpected path: ${path}`);
  });
}

describe("today route completion read model", () => {
  it("does no read while the company rollout is off", async () => {
    const request = vi.fn();
    await expect(loadTodayRouteCompletionReadModel(companyId, routePlan, "2026-11-09", request)).resolves.toEqual({ byCustomerId: {}, status: "off" });
    expect(request).not.toHaveBeenCalled();
  });

  it("projects exact order, event and proof summary only onto an existing confirmed stop", async () => {
    vi.stubEnv("FEATURE_STAGE_D_ORDER_IDS_COMPANY_IDS", companyId);
    const request = repository();
    const result = await loadTodayRouteCompletionReadModel(companyId, routePlan, "2026-11-09", request);

    expect(result).toEqual({
      status: "ready",
      byCustomerId: {
        [customerId]: [{
          attachmentCount: 1,
          completedAt: "2026-11-09T03:00:00Z",
          completionEventId: eventId,
          noteId,
          orderIds: [orderId],
          orderRevisions: { [orderId]: 4 }
        }]
      }
    });
    expect(request.mock.calls[0][0]).toContain(`company_id=eq.${companyId}&delivery_date=eq.2026-11-09&status=eq.delivered`);
    expect(request.mock.calls[1][0]).toContain(`company_id=eq.${companyId}&order_id=in.(${orderId})`);
    expect(request.mock.calls[2][0]).toContain(`company_id=eq.${companyId}&completion_event_id=in.(${eventId})`);
    expect(request.mock.calls[3][0]).toContain(`company_id=eq.${companyId}&completion_event_id=in.(${eventId})`);
  });

  it("fails closed on a revision mismatch or unavailable Draft schema", async () => {
    vi.stubEnv("FEATURE_STAGE_D_ORDER_IDS_COMPANY_IDS", companyId);
    await expect(loadTodayRouteCompletionReadModel(companyId, routePlan, "2026-11-09", repository({ mismatch: true }))).resolves.toEqual({ byCustomerId: {}, status: "unavailable" });
    await expect(loadTodayRouteCompletionReadModel(companyId, routePlan, "2026-11-09", repository({ schemaError: true }))).resolves.toEqual({ byCustomerId: {}, status: "unavailable" });
  });
});
