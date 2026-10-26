export async function findDuplicateCompanyByBusinessNumber(
  request: (path: string) => Promise<Array<{ id: string }>>,
  businessRegistrationNumber: string,
  companyId: string
) {
  try {
    const rows = await request(
      `companies?select=id&business_registration_number=eq.${encodeURIComponent(businessRegistrationNumber)}&id=neq.${encodeURIComponent(companyId)}&limit=1`
    );
    return rows[0] || null;
  } catch {
    throw new Error("사업자등록번호 중복 여부를 확인하지 못해 저장을 중단했습니다. 잠시 후 다시 시도해주세요.");
  }
}
