export declare function sendNotificationToUser({ userId, title, body, data, }: {
    userId: string;
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
export declare function sendNotificationToUserSafe({ userId, title, body, data, }: {
    userId: string;
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
} | null>;
