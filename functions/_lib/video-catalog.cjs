'use strict';

const catalog = require('../../content/lesson-videos.json');
const objectKeys = new Set(
  (catalog && Array.isArray(catalog.videos) ? catalog.videos : [])
    .map(video => video && video.objectKey)
    .filter(key => typeof key === 'string' && key.length > 0)
);

function isCatalogVideoKey(value) {
  return typeof value === 'string' && objectKeys.has(value);
}

module.exports = { isCatalogVideoKey };
