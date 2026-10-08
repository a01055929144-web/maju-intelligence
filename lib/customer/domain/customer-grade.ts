export const CUSTOMER_GRADES = ["A", "B", "C"] as const;

export type CustomerGrade = (typeof CUSTOMER_GRADES)[number];
export type CustomerGradeOverride = CustomerGrade | null;

export function isCustomerGrade(value: unknown): value is CustomerGrade {
  return typeof value === "string" && CUSTOMER_GRADES.includes(value as CustomerGrade);
}

export function requireCustomerGrade(value: unknown): CustomerGrade {
  if (!isCustomerGrade(value)) {
    throw new Error("등급은 A, B, C 중에서 선택하세요.");
  }
  return value;
}

export function requireCustomerGradeOverride(value: unknown): CustomerGradeOverride {
  if (value === "AUTO" || value === null) return null;
  return requireCustomerGrade(value);
}

export function getCustomerRevenueGrade(monthlyRevenue: number): CustomerGrade {
  if (monthlyRevenue >= 350) return "A";
  if (monthlyRevenue >= 180) return "B";
  return "C";
}
