// zoom.ts
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID!;
const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID!;
const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET!;

// 1. Get OAuth Access Token
export const getZoomAccessToken = async (): Promise<string> => {
    const response = await axios.post(
        `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
        {},
        {
            auth: {
                username: ZOOM_CLIENT_ID,
                password: ZOOM_CLIENT_SECRET,
            },
        }
    );

    return response.data.access_token;
};

// 2. Create Zoom Meeting
export const createZoomMeeting = async (
    userId: string, // e.g., "me" or email of Zoom user
    topic: string,
    startTime: string, // ISO8601 format: "2025-04-30T14:00:00Z"
    duration: number, // in minutes
    timezone = 'UTC'
): Promise<string> => {
    const token = await getZoomAccessToken();

    const response = await axios.post(
        `https://api.zoom.us/v2/users/${userId}/meetings`,
        {
            topic,
            type: 2, // Scheduled meeting
            start_time: startTime,
            duration,
            timezone,
            settings: {
                join_before_host: false,
                approval_type: 0,
                registration_type: 1,
                enforce_login: false,
                waiting_room: true
            }
        },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }
    );

    return response.data.join_url; // Invitation link
};

// 3. Update Zoom Meeting
export const updateZoomMeeting = async (
    meetingId: string,
    topic: string,
    startTime: string, // ISO8601 format
    duration: number,
    timezone = 'UTC'
): Promise<void> => {
    const token = await getZoomAccessToken();

    await axios.patch(
        `https://api.zoom.us/v2/meetings/${meetingId}`,
        {
            topic,
            start_time: startTime,
            duration,
            timezone
        },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }
    );
};

// 4. Delete Zoom Meeting
export const deleteZoomMeeting = async (meetingId: string): Promise<void> => {
    const token = await getZoomAccessToken();

    await axios.delete(
        `https://api.zoom.us/v2/meetings/${meetingId}`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }
    );
};

// 5. Extract Meeting ID from Zoom Join URL
export const extractMeetingIdFromZoomUrl = (url: string): string | null => {
    const match = url.match(/\/j\/(\d+)/);
    return match ? match[1] : null;
};
