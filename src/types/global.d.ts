// types/express/index.d.ts
import { User } from "@prisma/client"; // Optional, if you want exact typing

declare global {
    namespace Express {
        interface Request {
            user?: any; // or just { id: string } if you prefer minimal typing
            fileUrl?: string;
            fileUrls?: string[];
            filesFromS3?: any
        }
    }
}
