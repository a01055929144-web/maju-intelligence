export type LeadFavorite = {
  leadId: string;
  starred: boolean;
  starredAt: string | null;
  starredByName: string | null;
  starredByUserId: string | null;
};

export type SetLeadFavoriteInput = {
  actorName: string;
  actorUserId: string | null;
  companyId: string;
  leadId: string;
  starred: boolean;
};

export interface LeadFavoriteRepository {
  getMany(companyId: string, leadIds: string[]): Promise<LeadFavorite[]>;
  set(input: SetLeadFavoriteInput): Promise<LeadFavorite>;
}

export function parseLeadFavoriteIds(values: string[], limit = 100) {
  const ids = Array.from(new Set(values.map((value) => value.trim()).filter((value) => /^[0-9a-f-]{36}$/i.test(value))));
  if (!ids.length || ids.length > limit) throw new Error(`리드 ID를 1~${limit}개 입력해 주세요.`);
  return ids;
}

export function validateLeadFavoriteInput(input: SetLeadFavoriteInput) {
  if (!input.companyId.trim() || !input.leadId.trim()) throw new Error("회사와 리드 정보가 필요합니다.");
  if (!input.actorName.trim()) throw new Error("즐겨찾기를 표시한 사용자의 이름이 필요합니다.");
  return { ...input, actorName: input.actorName.trim() };
}
