export function getAdjacentLeadIds(leadIds: string[], currentLeadId: string) {
  const index = leadIds.indexOf(currentLeadId);
  return {
    nextId: index >= 0 ? leadIds[index + 1] : undefined,
    previousId: index > 0 ? leadIds[index - 1] : undefined
  };
}
