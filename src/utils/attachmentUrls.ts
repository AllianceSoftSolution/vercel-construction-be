import { Prisma } from "@prisma/client";

export const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024;

/** Normalize legacy string, string[], or JSON array to string[] */
export const normalizeAttachmentUrls = (input: unknown): string[] => {
  if (input == null) return [];
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        return normalizeAttachmentUrls(JSON.parse(trimmed));
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }
  if (Array.isArray(input)) {
    return input
      .flatMap((item) => normalizeAttachmentUrls(item))
      .filter(Boolean);
  }
  return [];
};

export const primaryAttachmentUrl = (input: unknown): string | null =>
  normalizeAttachmentUrls(input)[0] ?? null;

export const attachmentUrlsToJson = (
  urls: string[]
): Prisma.InputJsonValue | typeof Prisma.JsonNull => {
  const normalized = normalizeAttachmentUrls(urls);
  if (normalized.length === 0) return Prisma.JsonNull;
  return normalized as Prisma.InputJsonValue;
};

export const mapRecordAttachmentFields = <
  T extends Record<string, unknown>,
  K extends keyof T
>(
  record: T,
  fields: K[]
): T => {
  const next = { ...record };
  for (const field of fields) {
    if (field in next) {
      (next as Record<string, unknown>)[field as string] =
        normalizeAttachmentUrls(next[field]);
    }
  }
  return next;
};
