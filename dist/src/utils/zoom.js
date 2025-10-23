"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMeetingIdFromZoomUrl = exports.deleteZoomMeeting = exports.updateZoomMeeting = exports.createZoomMeeting = exports.getZoomAccessToken = void 0;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;
const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;
const getZoomAccessToken = async () => {
    const response = await axios_1.default.post(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`, {}, {
        auth: {
            username: ZOOM_CLIENT_ID,
            password: ZOOM_CLIENT_SECRET,
        },
    });
    return response.data.access_token;
};
exports.getZoomAccessToken = getZoomAccessToken;
const createZoomMeeting = async (userId, topic, startTime, duration, timezone = 'UTC') => {
    const token = await (0, exports.getZoomAccessToken)();
    const response = await axios_1.default.post(`https://api.zoom.us/v2/users/${userId}/meetings`, {
        topic,
        type: 2,
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
    }, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    return response.data.join_url;
};
exports.createZoomMeeting = createZoomMeeting;
const updateZoomMeeting = async (meetingId, topic, startTime, duration, timezone = 'UTC') => {
    const token = await (0, exports.getZoomAccessToken)();
    await axios_1.default.patch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
        topic,
        start_time: startTime,
        duration,
        timezone
    }, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
};
exports.updateZoomMeeting = updateZoomMeeting;
const deleteZoomMeeting = async (meetingId) => {
    const token = await (0, exports.getZoomAccessToken)();
    await axios_1.default.delete(`https://api.zoom.us/v2/meetings/${meetingId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
};
exports.deleteZoomMeeting = deleteZoomMeeting;
const extractMeetingIdFromZoomUrl = (url) => {
    const match = url.match(/\/j\/(\d+)/);
    return match ? match[1] : null;
};
exports.extractMeetingIdFromZoomUrl = extractMeetingIdFromZoomUrl;
//# sourceMappingURL=zoom.js.map