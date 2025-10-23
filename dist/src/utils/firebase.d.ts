export declare function sendFirebaseNotification({ tokens, title, body, data, }: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
}): Promise<{
    success: boolean;
    response: import("firebase-admin/lib/messaging/messaging-api").BatchResponse;
    error?: undefined;
} | {
    success: boolean;
    error: unknown;
    response?: undefined;
}>;
