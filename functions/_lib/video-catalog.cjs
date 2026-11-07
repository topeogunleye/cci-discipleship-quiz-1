'use strict';

const catalog = require('../../content/lesson-videos.json');
const transcriptCatalog = require('../../content/lesson-transcripts.json');
const videos = catalog && Array.isArray(catalog.videos) ? catalog.videos : [];
const videosByKey = new Map(videos.filter(video => video && typeof video.id === 'string' && typeof video.objectKey === 'string').map(video => [video.objectKey, video.id]));
const videoIds = new Set(videos.filter(video => video && typeof video.id === 'string').map(video => video.id));
const transcriptVideoIds = new Map(
  (transcriptCatalog && Array.isArray(transcriptCatalog.transcripts) ? transcriptCatalog.transcripts : [])
    .filter(item => item && typeof item.videoId === 'string' && typeof item.file === 'string')
    .map(item => [item.file.replace(/\.srt$/i, '.vtt'), item.videoId])
);

function isCatalogVideoKey(value) {
  return typeof value === 'string' && videosByKey.has(value);
}

function videoIdForObjectKey(value) {
  return typeof value === 'string' ? videosByKey.get(value) || null : null;
}

function isCatalogVideoId(value) {
  return typeof value === 'string' && videoIds.has(value);
}

function videoIdForTranscriptFilename(value) {
  return typeof value === 'string' ? transcriptVideoIds.get(value) || null : null;
}

module.exports = { isCatalogVideoKey, videoIdForObjectKey, isCatalogVideoId, videoIdForTranscriptFilename };
