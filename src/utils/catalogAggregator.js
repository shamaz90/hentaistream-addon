const logger = require('./logger');
const ratingNormalizer = require('./ratingNormalizer');
const { getMostRecentDate } = require('./dateParser');
const { selectBestDescription, isPromotionalDescription } = require('./descriptionHelper');
const { proxyImage } = require('./metadata');

// Lazy load database to avoid circular dependencies
let databaseLoader = null;
function getDatabase() {
  if (!databaseLoader) {
    databaseLoader = require('./databaseLoader');
  }
  return databaseLoader;
}

/**
 * Get catalog from pre-bundled database
 * Much faster than scraping - instant load for historical content
 * 
 * @param {Object} options - Options for catalog retrieval
 * @param {string} options.provider - Filter by provider ('hmm', 'hse', 'htv', or null for all)
 * @param {string} options.genre - Filter by genre
 * @param {number} options.skip - Items to skip (pagination)
 * @param {number} options.limit - Items to return
 * @param {string} options.sortBy - Sort order ('popular', 'recent', 'rating')
 * @returns {Array|null} Array of series or null if database not ready
 */
function getCatalogFromDatabase(options = {}) {
  const db = getDatabase();
  if (!db.isReady()) {
    logger.debug('[Aggregator] Database not ready, will use scrapers');
    return null;
  }
  
  const { provider = null, genre = null, skip = 0, limit = 30, sortBy = 'popular', studio = null, year = null } = options;
  
  // Get base catalog (all or by provider)
  let items = provider ? db.getByProvider(provider) : db.getCatalog();
  
  if (!items || items.length === 0) {
    return null;
  }
  
  // Filter by genre if specified
  if (genre) {
    const genreNormalized = genre.toLowerCase().trim();
    items = items.filter(item => {
      if (!item.genres || !Array.isArray(item.genres)) return false;
      return item.genres.some(g => {
        const gLower = g.toLowerCase().trim();
        return gLower === genreNormalized || 
               gLower.startsWith(genreNormalized + ' ') || 
               gLower.startsWith(genreNormalized + '-');
      });
    });
    logger.debug(`[Aggregator] Genre filter "${genre}" matched ${items.length} items`);
  }
  
  // Filter by studio if specified
  if (studio) {
    const studioLower = studio.toLowerCase().trim();
    items = items.filter(item => {
      if (!item.studio) return false;
      const itemStudio = item.studio.toLowerCase().trim();
      return itemStudio === studioLower;
    });
    logger.debug(`[Aggregator] Studio filter "${studio}" matched ${items.length} items`);
  }
  
  // Filter by year if specified
  if (year) {
    const targetYear = parseInt(year);
    if (!isNaN(targetYear)) {
      items = items.filter(item => {
        const itemYear = typeof item.year === 'string' ? parseInt(item.year) : item.year;
        if (itemYear === targetYear) return true;
        
        if (item.releaseInfo) {
          const match = String(item.releaseInfo).match(/(\d{4})/);
          if (match && parseInt(match[1]) === targetYear) return true;
        }
        
        if (item.lastUpdated) {
          const dateYear = new Date(item.lastUpdated).getFullYear();
          if (dateYear === targetYear) return true;
        }
        
        if (item.episodes && Array.isArray(item.episodes)) {
          for (const ep of item.episodes) {
            if (ep.released) {
              const epYear = new Date(ep.released).getFullYear();
              if (epYear === targetYear) return true;
            }
          }
        }
        
        return false;
      });
      logger.debug(`[Aggregator] Year filter "${targetYear}" matched ${items.length} items`);
    }
  }
  
  // Sort based on sortBy option
  switch (sortBy) {
    case 'recent':
      items.sort((a, b) => {
        const dateA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const dateB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return dateB - dateA;
      });
      break;
    case 'rating':
      items.sort((a, b) => {
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        return ratingB - ratingA;
      });
      break;
    case 'popular':
    default:
      items.sort((a, b) => {
        const scoreA = (a.viewCount || 0) + (a.rating || 0) * 10000 + (a.metadataScore || 0);
        const scoreB = (b.viewCount || 0) + (b.rating || 0) * 10000 + (b.metadataScore || 0);
        return scoreB - scoreA;
      });
  }
  
  // Apply pagination and enforce proxy on poster artwork
  const result = items.slice(skip, skip + limit).map(item => ({
    ...item,
    poster: proxyImage(item.poster || item.poster_url || item.cover_url || item.thumbnail),
    posterShape: 'poster'
  }));
  
  logger.debug(`[Aggregator] Database returned ${result.length} items (skip=${skip}, limit=${limit}, total=${items.length})`);
  
  return result;
}

/**
 * Get the newest content date from the database
 * @returns {Date|null}
 */
function getNewestDatabaseDate() {
  const db = getDatabase();
  if (!db.isReady()) return null;
  return db.getNewestContentDate();
}

/**
 * Get database build date
 * @returns {Date|null}
 */
function getDatabaseBuildDate() {
  const db = getDatabase();
  if (!db.isReady()) return null;
  return db.getBuildDate();
}

/**
 * Check if an item is in the pre-bundled database
 * Used to decide whether to fetch metadata from scrapers
 * @param {string} id - Series ID
 * @returns {Object|null} Database item or null
 */
function getFromDatabase(id) {
  const db = getDatabase();
  if (!db.isReady()) return null;
  const item = db.getById(id);
  if (!item) return null;

  return {
    ...item,
    poster: proxyImage(item.poster || item.poster_url || item.cover_url || item.thumbnail)
  };
}

/**
 * Check if database is available and ready
 */
function isDatabaseReady() {
  const db = getDatabase();
  return db.isReady();
}

/**
 * Search the database with relevance scoring
 * 
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {number} options.limit - Max results to return
 * @returns {Array} Sorted array of matching series
 */
function searchDatabase(query, options = {}) {
  const db = getDatabase();
  if (!db.isReady()) {
    logger.debug('[Aggregator] Database not ready for search');
    return null;
  }
  
  const { limit = 50 } = options;
  const queryLower = query.toLowerCase().trim();
  
  if (!queryLower) {
    return [];
  }
  
  const allItems = db.getCatalog();
  if (!allItems || allItems.length === 0) {
    return [];
  }
  
  const scored = [];
  
  for (const item of allItems) {
    const name = (item.name || '').toLowerCase();
    const description = (item.description || '').toLowerCase();
    const studio = (item.studio || '').toLowerCase();
    const genres = (item.genres || []).map(g => g.toLowerCase());
    
    let score = 0;
    
    if (name === queryLower) {
      score += 1000;
    } else if (name.startsWith(queryLower)) {
      score += 500;
    } else if (name.includes(queryLower)) {
      score += 200;
    }
    
    const queryWords = queryLower.split(/\s+/);
    const nameWords = name.split(/\s+/);
    
    const allWordsMatch = queryWords.every(qw => 
      nameWords.some(nw => nw.includes(qw))
    );
    if (allWordsMatch && queryWords.length > 1) {
      score += 150;
    }
    
    for (const qw of queryWords) {
      if (nameWords.some(nw => nw === qw)) {
        score += 50;
      } else if (nameWords.some(nw => nw.startsWith(qw))) {
        score += 25;
      }
    }
    
    if (studio === queryLower) {
      score += 300;
    } else if (studio.includes(queryLower)) {
      score += 100;
    }
    
    for (const genre of genres) {
      if (genre === queryLower) {
        score += 80;
      } else if (genre.includes(queryLower)) {
        score += 30;
      }
    }
    
    if (description.includes(queryLower)) {
      score += 10;
    }
    
    if (score > 0) {
      scored.push({ item, score });
    }
  }
  
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return (b.item.rating || 0) - (a.item.rating || 0);
  });
  
  const results = scored.slice(0, limit).map(s => ({
    ...s.item,
    poster: proxyImage(s.item.poster || s.item.poster_url || s.item.cover_url || s.item.thumbnail),
    posterShape: 'poster'
  }));
  
  logger.info(`[Aggregator] Database search "${query}" found ${scored.length} matches, returning top ${results.length}`);
  
  return results;
}

/**
 * Normalize series name for matching across providers
 */
function normalizeName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\s+(episode|ep|series|season|s)\s*\d*$/i, '');
}

/**
 * Calculate similarity between two strings
 */
function similarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(a, b) {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  
  return matrix[b.length][a.length];
}

function isDuplicate(series1, series2) {
  const name1 = normalizeName(series1.name);
  const name2 = normalizeName(series2.name);
  
  if (name1 === name2) return true;
  
  const score = similarity(name1, name2);
  return score >= 0.90;
}

function calculateAverageRating(ratingBreakdown) {
  return ratingNormalizer.getPriorityRating(ratingBreakdown);
}

function calculateMetadataScore(series) {
  let score = 0;
  
  const isHentaiMama = series.id && series.id.startsWith('hmm-');
  if (isHentaiMama) {
    score += 10;
  }
  
  if (series.description && series.description.length > 20) {
    score += 3;
    if (series.description.length > 100) score += 1;
    if (series.description.length > 200) score += 1;
  }
  
  if (series.genres && Array.isArray(series.genres)) {
    score += Math.min(series.genres.length, 5);
  }
  
  if (series.poster && series.poster.length > 10) {
    score += 2;
  }
  
  if (series.year) {
    score += 1;
  }
  
  if (series.rating && series.rating > 0) {
    score += 3;
    if (series.rating >= 8) score += 2;
  }
  
  return score;
}

function mergeSeries(existing, newSeries) {
  const getPrefixFromId = (id) => {
    const match = id.match(/^([a-z]+)-/);
    return match ? match[1] : 'unknown';
  };
  
  const existingPrefix = getPrefixFromId(existing.id);
  const newPrefix = getPrefixFromId(newSeries.id);
  
  const existingScore = calculateMetadataScore(existing);
  const newScore = calculateMetadataScore(newSeries);
  
  let primary, secondary;
  if (newScore > existingScore) {
    primary = { ...newSeries };
    secondary = existing;
  } else {
    primary = existing;
    secondary = newSeries;
  }
  
  const primaryPrefix = getPrefixFromId(primary.id);
  const secondaryPrefix = getPrefixFromId(secondary.id);
  
  if (!primary.providers) primary.providers = [primaryPrefix];
  if (!primary.providerSlugs) primary.providerSlugs = { [primaryPrefix]: primary.id.replace(`${primaryPrefix}-`, '') };
  if (!primary.ratingBreakdown) primary.ratingBreakdown = {};
  
  if (existing.providers) {
    existing.providers.forEach(p => {
      if (!primary.providers.includes(p)) primary.providers.push(p);
    });
  }
  if (existing.providerSlugs) {
    Object.assign(primary.providerSlugs, existing.providerSlugs);
  }
  if (existing.ratingBreakdown) {
    Object.assign(primary.ratingBreakdown, existing.ratingBreakdown);
  }
  
  if (primary.rating !== undefined && primary.rating !== null && !primary.ratingBreakdown[primaryPrefix]) {
    primary.ratingBreakdown[primaryPrefix] = {
      raw: primary.rating,
      type: primary.ratingType || 'direct',
      voteCount: primary.voteCount || null
    };
  }
  if (primary.viewCount !== undefined && primary.viewCount !== null && !primary.ratingBreakdown[primaryPrefix]) {
    primary.ratingBreakdown[primaryPrefix] = {
      raw: primary.viewCount,
      type: 'views'
    };
  }
  
  if (secondary.rating !== undefined && secondary.rating !== null) {
    secondary.ratingBreakdown = secondary.ratingBreakdown || {};
    secondary.ratingBreakdown[secondaryPrefix] = {
      raw: secondary.rating,
      type: secondary.ratingType || 'direct',
      voteCount: secondary.voteCount || null
    };
  }
  if (secondary.viewCount !== undefined && secondary.viewCount !== null) {
    secondary.ratingBreakdown = secondary.ratingBreakdown || {};
    secondary.ratingBreakdown[secondaryPrefix] = {
      raw: secondary.viewCount,
      type: 'views'
    };
  }
  
  if (secondary.ratingBreakdown) {
    Object.assign(primary.ratingBreakdown, secondary.ratingBreakdown);
  }
  
  if (!primary.providers.includes(secondaryPrefix)) {
    primary.providers.push(secondaryPrefix);
  }
  primary.providerSlugs[secondaryPrefix] = secondary.id.replace(`${secondaryPrefix}-`, '');
  
  const ratingResult = calculateAverageRating(primary.ratingBreakdown);
  primary.rating = ratingResult.rating;
  primary.ratingSource = ratingResult.source;
  primary.ratingIsNA = ratingResult.isNA;
  
  if (!primary.poster && secondary.poster) {
    primary.poster = secondary.poster;
  }
  
  primary.poster = proxyImage(primary.poster);
  
  const descriptions = [
    primary.description,
    secondary.description
  ].filter(d => d && d.length > 0);
  
  if (descriptions.length > 0) {
    primary.description = selectBestDescription(descriptions);
  }
  
  if (secondary.genres && Array.isArray(secondary.genres)) {
    if (!primary.genres) primary.genres = [];
    const allGenres = [...primary.genres, ...secondary.genres];
    const studioName = primary.studio || secondary.studio;
    const filteredGenres = studioName 
      ? allGenres.filter(g => g.toLowerCase() !== studioName.toLowerCase())
      : allGenres;
    primary.genres = [...new Set(filteredGenres)];
  }
  
  if (!primary.studio && secondary.studio) {
    primary.studio = secondary.studio;
  } else if (primary.studio && secondary.studio) {
    const primaryAllCaps = primary.studio === primary.studio.toUpperCase();
    const secondaryAllCaps = secondary.studio === secondary.studio.toUpperCase();
    if (primaryAllCaps && !secondaryAllCaps) {
      primary.studio = secondary.studio;
    }
  }
  
  if (!primary.year && secondary.year) {
    primary.year = secondary.year;
  }
  
  primary.lastUpdated = getMostRecentDate(primary.lastUpdated, secondary.lastUpdated);
  primary.metadataScore = calculateMetadataScore(primary);
  
  return primary;
}

function aggregateCatalogs(providerCatalogs) {
  const startTime = Date.now();
  const aggregated = [];
  
  logger.info(`Aggregating catalogs from ${providerCatalogs.length} providers`);
  
  const providerStats = {};
  
  for (const { provider, catalog } of providerCatalogs) {
    logger.info(`Processing ${catalog.length} series from ${provider}`);
    providerStats[provider] = { total: catalog.length, merged: 0, added: 0 };
    
    for (const series of catalog) {
      const existingIndex = aggregated.findIndex(s => isDuplicate(s, series));
      
      if (existingIndex >= 0) {
        aggregated[existingIndex] = mergeSeries(aggregated[existingIndex], series);
        logger.debug(`Merged duplicate: ${series.name} from ${provider}`);
        providerStats[provider].merged++;
      } else {
        providerStats[provider].added++;
        const getPrefixFromId = (id) => {
          const match = id.match(/^([a-z]+)-/);
          return match ? match[1] : 'unknown';
        };
        
        const prefix = getPrefixFromId(series.id);
        
        const ratingBreakdown = {};
        if (series.rating !== undefined && series.rating !== null) {
          ratingBreakdown[prefix] = {
            raw: series.rating,
            type: series.ratingType || 'direct'
          };
        } else if (series.viewCount !== undefined && series.viewCount !== null) {
          ratingBreakdown[prefix] = {
            raw: series.viewCount,
            type: 'views'
          };
        }
        
        let filteredGenres = series.genres;
        if (series.studio && Array.isArray(series.genres)) {
          filteredGenres = series.genres.filter(g => 
            g.toLowerCase() !== series.studio.toLowerCase()
          );
        }
        
        let cleanedDescription = series.description;
        if (isPromotionalDescription(series.description)) {
          cleanedDescription = 'No Description';
        }
        
        const newSeries = {
          ...series,
          poster: proxyImage(series.poster || series.poster_url || series.cover_url || series.thumbnail),
          posterShape: 'poster',
          genres: filteredGenres,
          description: cleanedDescription,
          providers: [prefix],
          providerSlugs: {
            [prefix]: series.id.replace(`${prefix}-`, '')
          },
          ratingBreakdown: ratingBreakdown,
          metadataScore: calculateMetadataScore(series)
        };
        
        const ratingResult = calculateAverageRating(newSeries.ratingBreakdown);
        newSeries.rating = ratingResult.rating;
        newSeries.ratingSource = ratingResult.source;
        newSeries.ratingIsNA = ratingResult.isNA;
        
        aggregated.push(newSeries);
      }
    }
  }
  
  aggregated.sort((a, b) => {
    const scoreDiff = (b.metadataScore || 0) - (a.metadataScore || 0);
    if (scoreDiff !== 0) return scoreDiff;
    
    const providerDiff = (b.providers?.length || 1) - (a.providers?.length || 1);
    if (providerDiff !== 0) return providerDiff;
    
    return (a.name || '').localeCompare(b.name || '');
  });
  
  const duration = Date.now() - startTime;
  
  logger.info(`📊 Aggregation stats:`);
  for (const [prov, stats] of Object.entries(providerStats)) {
    logger.info(`  ${prov}: ${stats.total} total → ${stats.added} added, ${stats.merged} merged`);
  }
  
  const prefixCounts = {};
  for (const item of aggregated) {
    const prefix = item.id?.split('-')[0] || 'unknown';
    prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
  }
  logger.info(`📊 Final ID prefixes: ${JSON.stringify(prefixCounts)}`);
  
  logger.info(`Catalog aggregation complete: ${aggregated.length} unique series from ${providerCatalogs.length} providers (${duration}ms)`);
  
  return aggregated;
}

module.exports = {
  aggregateCatalogs,
  normalizeName,
  similarity,
  isDuplicate,
  calculateAverageRating,
  calculateMetadataScore,
  mergeSeries,
  getCatalogFromDatabase,
  getFromDatabase,
  isDatabaseReady,
  getNewestDatabaseDate,
  getDatabaseBuildDate,
  searchDatabase
};
