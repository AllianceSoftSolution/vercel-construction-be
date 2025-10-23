"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getYouTubeThumbnail = getYouTubeThumbnail;
exports.randomPassword = randomPassword;
function getYouTubeThumbnail(url, quality = 'hq') {
    const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    if (!match || !match[1])
        return null;
    const videoId = match[1];
    const qualityMap = {
        default: 'default.jpg',
        mq: 'mqdefault.jpg',
        hq: 'hqdefault.jpg',
        sd: 'sddefault.jpg',
        maxres: 'maxresdefault.jpg',
    };
    const thumbnailFile = qualityMap[quality] || 'hqdefault.jpg';
    return `https://img.youtube.com/vi/${videoId}/${thumbnailFile}`;
}
function randomPassword(length = 10) {
    const crypto = require('crypto');
    return crypto.randomBytes(length)
        .toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, length);
}
//# sourceMappingURL=helpers.js.map