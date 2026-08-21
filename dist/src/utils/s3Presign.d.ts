export declare const getPublicS3Url: (key: string) => string;
export declare const buildS3ObjectKey: (folder: string, fileName: string) => string;
export declare const createPresignedPutUrl: (key: string, mimeType: string, expiresSeconds?: number) => Promise<string>;
