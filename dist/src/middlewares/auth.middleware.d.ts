import { Request, Response, NextFunction } from "express";
interface AuthRequest extends Request {
    user?: any;
}
declare const protect: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export default protect;
