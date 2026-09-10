/**
 * Metadata utility functions for transforming API data to Stremio format
 */

const parser = require('./parser');
const logger = require('./logger');

/**
 * Wraps raw image URLs with the wsrv.nl proxy to bypass hotlink protection and fix missing protocols.
 * @param {string} url - Raw artwork image URL
 * @returns {string} Proxied image URL
 */
function proxyImage(url) {
  if (!url || typeof url !== 'string') return '';
  
  // Prevent double proxying
  if (url.includes('wsrv.nl')) return url;

  // Add missing protocol if relative (e.g. //cdn.com/image.jpg)
  const fullUrl = url.startsWith('//') ? `https:${url}` : url;

  return `https://wsrv.nl/?url=${encodeURIComponent(fullUrl)}&output=webp&q=80`;
}

/**
 * Transform API metadata to Stremio meta object
 * @param {Object} apiData - Raw metadata from API
 * @param {string} provider - Provider name (hanime, hh, etc.)
 * @returns {Object} Stremio-formatted meta object
 */
function toStremioMeta(apiData, provider) {
  if (!apiData) {
    logger.warn('Invalid API data for metadata transformation');
    return null;
  }

  const id = `${provider}-${apiData.slug || apiData.id}`;
  const name = apiData.name || apiData.title || 'Unknown';
  const rawPoster = apiData.poster_url || apiData.poster || apiData.cover_url || apiData.thumbnail;
  const rawBackground = apiData.background_url || apiData.background || rawPoster;
  
  const poster = proxyImage(rawPoster);
  const background = proxyImage(rawBackground);
  const logo = apiData.logo_url ? proxyImage(apiData.logo_url) : null;

  const description = parser.formatDescription(apiData.description || apiData.synopsis || '');
  const releaseInfo = parser.parseReleaseYear(apiData.released_at || apiData.release_date || apiData.created_at);
  const genres = parser.normalizeGenres(apiData.tags || apiData.genres || apiData.categories || []);

  return {
    id,
    type: 'series',
    name,
    poster,
    background,
    logo,
    description,
    releaseInfo,
    genres,
    runtime: parser.formatRuntime(apiData.duration || apiData.runtime),
    director: apiData.brand || apiData.studio ? [apiData.brand || apiData.studio] : undefined,
    cast: apiData.characters || undefined,
    imdbRating: apiData.rating || apiData.score || undefined,
    links: apiData.external_links || undefined,
    videos: apiData.episodes ? parser.buildVideosArray(apiData.slug || apiData.id, apiData.episodes) : [],
    behaviorHints: {
      defaultVideoId: apiData.episodes && apiData.episodes.length > 0 
        ? parser.createVideoId(apiData.slug || apiData.id, 1, 1)
        : undefined,
    },
  };
}

/**
 * Transform API catalog item to Stremio catalog meta preview
 * @param {Object} item - Raw catalog item from API
 * @param {string} provider - Provider name
 * @returns {Object} Stremio-formatted catalog item
 */
function toCatalogMeta(item, provider) {
  if (!item) return null;

  const id = `${provider}-${item.slug || item.id}`;
  const name = item.name || item.title || 'Unknown';
  const rawPoster = item.poster_url || item.poster || item.cover_url || item.thumbnail;
  const genres = parser.normalizeGenres(item.tags || item.genres || []).slice(0, 3);

  return {
    id,
    type: 'series',
    name,
    poster: proxyImage(rawPoster),
    genres,
    description: parser.formatDescription(item.description || '', 200),
    posterShape: 'poster',
  };
}

/**
 * Extract poster URL with fallback
 * @param {Object} data - Data object with potential poster fields
 * @param {string} fallback - Fallback URL
 * @returns {string} Proxied poster URL
 */
function extractPosterUrl(data, fallback = null) {
  const rawUrl = (
    data.poster_url ||
    data.poster ||
    data.cover_url ||
    data.thumbnail ||
    data.image ||
    fallback ||
    'https://via.placeholder.com/300x450?text=No+Poster'
  );

  return proxyImage(rawUrl);
}

/**
 * Validate required meta fields
 * @param {Object} meta - Meta object to validate
 * @returns {boolean} True if valid
 */
function validateMeta(meta) {
  if (!meta) return false;

  const required = ['id', 'type', 'name'];
  const hasRequired = required.every(field => meta[field]);

  if (!hasRequired) {
    logger.warn('Meta object missing required fields:', { meta });
    return false;
  }

  return true;
}

/**
 * Merge metadata from multiple sources
 * @param {Object} primary - Primary metadata source
 * @param {Object} secondary - Secondary metadata source
 * @returns {Object} Merged metadata
 */
function mergeMeta(primary, secondary) {
  if (!secondary) return primary;
  if (!primary) return secondary;

  return {
    ...secondary,
    ...primary,
    genres: [...new Set([...(primary.genres || []), ...(secondary.genres || [])])],
    cast: [...new Set([...(primary.cast || []), ...(secondary.cast || [])])],
    id: primary.id,
    type: primary.type,
    name: primary.name || secondary.name,
    poster: primary.poster || secondary.poster,
    background: primary.background || secondary.background,
  };
}

/**
 * Add additional metadata fields for rich display
 * @param {Object} meta - Base meta object
 * @param {Object} additionalData - Additional data to add
 * @returns {Object} Enhanced meta object
 */
function enhanceMeta(meta, additionalData = {}) {
  return {
    ...meta,
    popularityScore: additionalData.views || additionalData.popularity,
    contentRating: additionalData.censorship || additionalData.rating,
    language: additionalData.language || 'Japanese',
    website: additionalData.url || additionalData.website,
  };
}

module.exports = {
  proxyImage,
  toStremioMeta,
  toCatalogMeta,
  extractPosterUrl,
  validateMeta,
  mergeMeta,
  enhanceMeta,
};
