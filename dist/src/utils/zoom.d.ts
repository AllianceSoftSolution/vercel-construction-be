export declare const getZoomAccessToken: () => Promise<string>;
export declare const createZoomMeeting: (userId: string, topic: string, startTime: string, duration: number, timezone?: string) => Promise<string>;
export declare const updateZoomMeeting: (meetingId: string, topic: string, startTime: string, duration: number, timezone?: string) => Promise<void>;
export declare const deleteZoomMeeting: (meetingId: string) => Promise<void>;
export declare const extractMeetingIdFromZoomUrl: (url: string) => string | null;
