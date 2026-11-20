import type { LeadFavoriteRepository, SetLeadFavoriteInput } from "../../domains/lead/lead-favorite";
import { validateLeadFavoriteInput } from "../../domains/lead/lead-favorite";

export function setLeadFavorite(repository: LeadFavoriteRepository, input: SetLeadFavoriteInput) {
  return repository.set(validateLeadFavoriteInput(input));
}
