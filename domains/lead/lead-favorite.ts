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
  set(input: SetLeadFavoriteInput): Promise<LeadFavorite>;
}

export function validateLeadFavoriteInput(input: SetLeadFavoriteInput) {
  if (!input.companyId.trim() || !input.leadId.trim()) throw new Error("회사와 리드 정보가 필요합니다.");
  if (!input.actorName.trim()) throw new Error("즐겨찾기를 표시한 사용자의 이름이 필요합니다.");
  return { ...input, actorName: input.actorName.trim() };
}
