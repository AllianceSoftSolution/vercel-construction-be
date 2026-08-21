import { Prisma } from "@prisma/client";
export declare const MAX_FILE_SIZE_BYTES: number;
export declare const normalizeAttachmentUrls: (input: unknown) => string[];
export declare const primaryAttachmentUrl: (input: unknown) => string | null;
export declare const attachmentUrlsToJson: (urls: string[]) => Prisma.InputJsonValue | typeof Prisma.JsonNull;
export declare const requireAttachmentUrls: (urls: string[], fieldLabel: string) => void;
export declare const mapRecordAttachmentFields: <T extends Record<string, unknown>, K extends keyof T>(record: T, fields: K[]) => T;
