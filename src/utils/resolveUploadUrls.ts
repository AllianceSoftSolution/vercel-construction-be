import { Request } from "express";
import { normalizeAttachmentUrls } from "./attachmentUrls";

type ResolveUploadOptions = {
  bodyKey: string;
  multipartKey: string;
};

export const resolveUploadUrls = (
  req: Request,
  { bodyKey, multipartKey }: ResolveUploadOptions
): string[] => {
  let fromBody: unknown = req.body?.[bodyKey];

  if (typeof fromBody === "string" && fromBody.trim()) {
    try {
      fromBody = JSON.parse(fromBody);
    } catch {
      fromBody = [fromBody];
    }
  }

  const bodyUrls = normalizeAttachmentUrls(fromBody);
  if (bodyUrls.length > 0) return bodyUrls;

  const filesFromS3 = (req as any).filesFromS3?.[multipartKey];
  return normalizeAttachmentUrls(filesFromS3);
};
