export type StructuredSaveAttempt = {
  key: string;
  snapshot: string;
};

export function createStructuredSaveSnapshot(value: unknown) {
  return JSON.stringify(value);
}

export function resolveStructuredSaveAttempt(
  current: StructuredSaveAttempt | null,
  snapshot: string,
  createId: () => string = () => crypto.randomUUID()
): StructuredSaveAttempt {
  if (current?.snapshot === snapshot) return current;
  return { key: `sales:${createId()}`, snapshot };
}
