import type { CustomerGradeRepository } from "../application/bulk-update-customer-grade";
import { bulkUpdateCustomerGradeOverride } from "@/lib/store";

export const storeCustomerGradeRepository: CustomerGradeRepository = {
  async bulkUpdateGrade(companyId, customerIds, grade) {
    try {
      return await bulkUpdateCustomerGradeOverride(companyId, customerIds, grade);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("grade_override") || message.includes("normalized_customers_grade_override")) {
        throw new Error("거래처 등급 저장 컬럼이 아직 없습니다. Supabase SQL Editor에서 20261008_customer_grade_override.sql을 먼저 실행하세요.");
      }
      throw error;
    }
  }
};
