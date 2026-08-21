import { Request } from "express";
type ResolveUploadOptions = {
    bodyKey: string;
    multipartKey: string;
};
export declare const resolveUploadUrls: (req: Request, { bodyKey, multipartKey }: ResolveUploadOptions) => string[];
export {};
