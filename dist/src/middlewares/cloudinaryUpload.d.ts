import { Request, Response, NextFunction } from "express";
interface CloudinaryUploadedFiles {
    [fieldname: string]: string[];
}
export interface CustomRequest extends Request {
    cloudinaryFiles?: CloudinaryUploadedFiles;
}
export declare const cloudinaryUploadMiddleware: (req: CustomRequest, res: Response, next: NextFunction) => Promise<void>;
export {};
