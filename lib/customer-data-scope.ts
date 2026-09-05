import type { CustomerSession } from "./auth";
import type { ChurnRiskCustomer, CustomerMasterItem, RoutePlan, StaffVehicleLocation } from "./store";

type CustomerMasterLike = {
  customers: CustomerMasterItem[];
};

export function normalizeAssignmentValue(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-().]/g, "");
}

function normalizeAssignmentTokens(value?: string | null) {
  const tokens = String(value || "")
    .toLowerCase()
    .split(/[\s,;/|·:()[\]{}<>_\-]+/g)
    .map((token) => normalizeAssignmentValue(token))
    .filter(Boolean);
  return Array.from(
    new Set(
      tokens.flatMap((token) => {
        const stripped = token.replace(/(기사님|담당자님|매니저님|기사|담당자|매니저|님)$/, "");
        return stripped && stripped !== token ? [token, stripped] : [token];
      })
    )
  );
}

export function getSessionAssignmentKeys(session: CustomerSession | null) {
  if (!session) return new Set<string>();
  const keys = [session.name, session.email, session.email?.split("@")[0], session.userId, ...(session.assignmentKeys || [])]
    .map((value) => normalizeAssignmentValue(value))
    .filter(Boolean);
  return new Set(keys);
}

export function shouldScopeCustomerSession(session: CustomerSession | null) {
  return Boolean(session && !["owner", "manager"].includes(session.workspaceRole));
}

export function isAssignedToSession(value: string | undefined, assignmentKeys: Set<string>) {
  const normalizedValue = normalizeAssignmentValue(value);
  if (!normalizedValue) return false;
  if (assignmentKeys.has(normalizedValue)) return true;
  const tokens = normalizeAssignmentTokens(value);
  if (tokens.some((token) => assignmentKeys.has(token))) return true;
  return Array.from(assignmentKeys).some((key) => key.length >= 5 && normalizedValue.includes(key));
}

export function scopeCustomerMasterForSession<T extends CustomerMasterLike>(customerMaster: T, session: CustomerSession | null): T {
  if (!shouldScopeCustomerSession(session)) return customerMaster;
  const assignmentKeys = getSessionAssignmentKeys(session);
  return {
    ...customerMaster,
    customers: customerMaster.customers.filter((customer) => isAssignedToSession(customer.deliveryManager, assignmentKeys))
  };
}

export function scopeRoutePlanForSession(routePlan: RoutePlan, session: CustomerSession | null): RoutePlan {
  if (!shouldScopeCustomerSession(session)) return routePlan;
  const assignmentKeys = getSessionAssignmentKeys(session);
  const groups = routePlan.groups
    .map((group) => {
      const stops = group.stops.filter((stop) => isAssignedToSession(stop.deliveryDriver, assignmentKeys));
      return {
        ...group,
        stops,
        expectedRevenue: stops.reduce((total, stop) => total + Number(stop.expectedRevenue || 0), 0),
        totalDistanceKm: Math.round(stops.reduce((total, stop) => total + Number(stop.distanceKm || 0), 0) * 10) / 10,
        totalDurationMinutes: stops.reduce((total, stop) => total + Number(stop.durationMinutes || 0), 0)
      };
    })
    .filter((group) => group.stops.length > 0);
  return {
    ...routePlan,
    groups,
    totalDistanceKm: Math.round(groups.reduce((total, group) => total + group.totalDistanceKm, 0) * 10) / 10,
    totalDurationMinutes: groups.reduce((total, group) => total + group.totalDurationMinutes, 0),
    totalExpectedRevenue: groups.reduce((total, group) => total + group.expectedRevenue, 0),
    totalStops: groups.reduce((total, group) => total + group.stops.length, 0)
  };
}

export function scopeChurnRiskCustomersForSession(customers: ChurnRiskCustomer[], visibleCustomers: CustomerMasterItem[], session: CustomerSession | null) {
  if (!shouldScopeCustomerSession(session)) return customers;
  const visibleCustomerIds = new Set(visibleCustomers.map((customer) => customer.id));
  return customers.filter((customer) => visibleCustomerIds.has(customer.customerId));
}

export function scopeStaffVehicleLocationsForSession(locations: StaffVehicleLocation[], session: CustomerSession | null) {
  if (!shouldScopeCustomerSession(session)) return locations;
  const assignmentKeys = getSessionAssignmentKeys(session);
  return locations.filter((location) => assignmentKeys.has(normalizeAssignmentValue(location.userId)) || isAssignedToSession(location.driverName, assignmentKeys));
}
