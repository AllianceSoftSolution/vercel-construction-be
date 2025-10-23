import { Request, Response, NextFunction } from "express";
export declare const s3UploadMiddleware: (fields: {
    name: string;
    maxCount: number;
}[]) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
