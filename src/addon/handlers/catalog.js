/**
 * Format a series object to Stremio meta format
 * Used for both database and scraper results
 * @param {Object} series - Series object from database or aggregator
 * @returns {Object} Stremio-compatible meta object
 */
function formatSeriesMeta(series) {
  const formatted = { ...series };
  
  // FIXED: Must be 'hentai' to match manifest definition and metadata utilities
  formatted.type = 'hentai';

  // Proxy image fields so they bypass hotlink protection and load reliably
  if (formatted.poster) formatted.poster = proxyImage(formatted.poster);
  if (formatted.background) formatted.background = proxyImage(formatted.background);
  if (formatted.logo) formatted.logo = proxyImage(formatted.logo);
  
  // Use runtime field for rating display (to avoid IMDb logo)
  // Priority-based system: HentaiMama > HentaiTV > HentaiSea > N/A
  if (series.ratingIsNA) {
    formatted.runtime = `★ N/A`;
  } else if (series.rating !== null && series.rating !== undefined && !isNaN(series.rating)) {
    formatted.runtime = `★ ${series.rating.toFixed(1)}`;
  } else {
    formatted.runtime = `★ N/A`;
  }
  
  // releaseInfo should only contain year
  if (series.year) {
    formatted.releaseInfo = series.year.toString();
  }
  
  // Ensure genres array is passed through
  const genres = (series.genres && Array.isArray(series.genres) && series.genres.length > 0) 
    ? series.genres 
    : [];
  formatted.genres = genres.length > 0 ? genres : undefined;
  
  // Build links array with BOTH studio and genres
  const studioLinks = series.studio ? [{
    name: series.studio,
    category: 'Studio',
    url: `stremio:///search?search=${encodeURIComponent(series.studio)}`
  }] : [];
  
  const genreLinks = genres.map(genre => ({
    name: genre,
    category: 'Genres',
    url: `stremio:///search?search=${encodeURIComponent(genre)}`
  }));
  
  // Combine: genres first, then studio
  const allLinks = [...genreLinks, ...studioLinks];
  if (allLinks.length > 0) {
    formatted.links = allLinks;
  }
  
  return formatted;
}
