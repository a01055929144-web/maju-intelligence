export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

export function formatUploadSizeMb(bytes: number) {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
}
