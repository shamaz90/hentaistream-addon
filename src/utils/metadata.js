/**
 * Metadata transformation utilities for Stremio
 */

/**
 * Proxies an image URL through wsrv.nl for reliable loading
 * @param {string} url - Original image URL
 * @returns {string} - Proxied image URL
 */
function proxyImage(url) {
  if (!url) return '';
  // If already proxied or a local asset, return as is
  if (url.includes('wsrv.nl') || url.startsWith('/') || url.startsWith('data:')) {
    return url;
  }
  // Use wsrv.nl as a reliable image CDN proxy
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=webp&q=80`;
}

/**
 * Transforms raw provider series data into a full Stremio Meta object
 * @param {Object} item - Raw item from database/scraper
 * @returns {Object} - Stremio meta object
 */
function toStremioMeta(item) {
  return {
    id: item.id,
    type: 'hentai', // MUST be 'hentai' to match manifest definition
    name: item.title || item.name || 'Unknown',
    poster: proxyImage(item.poster || item.cover),
    background: proxyImage(item.background || item.banner),
    logo: proxyImage(item.logo),
    description: item.description || 'No description available.',
    releaseInfo: item.releaseInfo || item.year || '',
    genres: item.genres || [],
    cast: item.cast || [],
    director: item.director || item.studio || '',
    imdbRating: item.rating ? String(item.rating) : undefined,
    videos: (item.videos || []).map((video, index) => ({
      id: video.id || `${item.id}:${index + 1}`,
      title: video.title || `Episode ${index + 1}`,
      released: video.released || new Date().toISOString(),
      episode: video.episode || index + 1,
      season: video.season || 1,
      stream: video.stream
    }))
  };
}

/**
 * Transforms raw item data into a lightweight Stremio Catalog Meta object
 * @param {Object} item - Raw item from database/scraper
 * @returns {Object} - Stremio catalog meta object
 */
function toCatalogMeta(item) {
  return {
    id: item.id,
    type: 'hentai', // MUST be 'hentai' to match manifest definition
    name: item.title || item.name || 'Unknown',
    poster: proxyImage(item.poster || item.cover),
    description: item.description || '',
    genres: item.genres || [],
    releaseInfo: item.releaseInfo || item.year || '',
    imdbRating: item.rating ? String(item.rating) : undefined
  };
}

module.exports = {
  proxyImage,
  toStremioMeta,
  toCatalogMeta
};
