export function getYouTubeThumbnail(url: string, quality: 'default' | 'mq' | 'hq' | 'sd' | 'maxres' = 'hq'): string | null {
    const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);

    if (!match || !match[1]) return null;

    const videoId = match[1];

    const qualityMap: Record<string, string> = {
        default: 'default.jpg',
        mq: 'mqdefault.jpg',
        hq: 'hqdefault.jpg',
        sd: 'sddefault.jpg',
        maxres: 'maxresdefault.jpg',
    };

    const thumbnailFile = qualityMap[quality] || 'hqdefault.jpg';

    return `https://img.youtube.com/vi/${videoId}/${thumbnailFile}`;
}

// Generates a secure random password of the given length (default 10)
export function randomPassword(length: number = 10): string {
    const crypto = require('crypto');
    return crypto.randomBytes(length)
        .toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, length);
}
