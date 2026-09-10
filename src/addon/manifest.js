const config = require('../config/env');
const fs = require('fs');
const path = require('path');

// Spam entries to filter out from both genres and studios
const SPAM_ENTRIES = [
  '[email protected]', '[email\u00a0protected]', 'email protected', 'email-protected',
  'better than e-hentai', 'better than nhentai', 'gehentai', 'noname',
  'watch hentai', 'hentai stream', 'free hentai'
];

function isSpamEntry(name) {
  const lower = name.toLowerCase().trim();
  return SPAM_ENTRIES.some(spam => lower.includes(spam));
}

function normalizeName(name) {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

const GENRE_OPTIONS = [
  "3D", "Action", "Adventure", "Ahegao", "Anal", "Animal Girls", "BDSM", 
  "Big Ass", "Big Boobs", "Blackmail", "Blow Job", "Blowjob", "Bondage", 
  "Boob Job", "Brainwashed", "Bukkake", "Bunny Girl", "Cat Girl", "Censored",
  "Cheating", "Comedy", "Condom", "Corruption", "Cosplay", "Cowgirl", 
  "Cream Pie", "Cross-dressing", "Cunnilingus", "Cute & Funny", 
  "Dark Skin", "Deepthroat", "Demons", "Dildo", "Doctor", "Doggy Style", 
  "Domination", "Double Penetration", "Drama", "Drugs", "Dubbed", "Ecchi", 
  "Elf", "Eroge", "Facial", "Facesitting", "Fantasy", "Female Doctor", 
  "Female Teacher", "Femdom", "Filmed", "Fingering", "Foot Job", "Footjob", 
  "Fox Girl", "Furry", "Futanari", "Gangbang", "Glasses", "Group Sex", 
  "Gyaru", "Hand Job", "Handjob", "Harem", "HD", "Historical", "Horror", 
  "Horny Slut", "Housewife", "Humiliation", "Idol", "Incest", "Inflation", 
  "Internal Cumshot", "Lactation", "Large Breasts", "Loli", "Magical Girls", 
  "Maid", "Martial Arts", "Masturbation", "Megane", "MILF", "Mind Break", 
  "Mind Control", "Missionary", "Molestation", "Monster", "Monster Girl", 
  "Nekomimi", "Non-Japanese", "NTR", "Nuns", "Nurse", "Nurses", "Office Ladies", 
  "Oral", "Oral Sex", "Orc", "Orgy", "Paizuri", "Pantyhose", "Plot", "Police", 
  "POV", "Pregnant", "Princess", "Prostitution", "Public Sex", "Queen Bee", 
  "Rape", "Reverse Cowgirl", "Reverse Rape", "Rim Job", "Rimjob", "Romance", 
  "Scat", "School Girl", "School Girls", "Schoolgirl", "Sci-Fi", "Sex Toys", 
  "Shimapan", "Short", "Shota", "Shoutacon", "Sister", "Slave", "Small Breasts", 
  "Softcore", "Sports", "Squirting", "Step Daughter", "Step Mother", "Step Sister", 
  "Stocking", "Strap-on", "Succubus", "Super Power", "Supernatural", "Swimsuit", 
  "Teacher", "Tentac", "Tentacle", "Tentacles", "Threesome", "Tits Fuck", "Toys", 
  "Train Molestation", "Trap", "Tsundere", "Twin Tail", "Twins", "Ugly Bastard",
  "Uncensored", "Urination", "Vampire", "Vanilla", "Virgin", "Virgins", 
  "Watersports", "Widow", "X-Ray", "Yaoi", "Yuri"
];

function loadFilterOptions() {
  const optionsPath = path.join(__dirname, '..', '..', 'data', 'filter-options.json');
  try {
    if (fs.existsSync(optionsPath)) {
      return JSON.parse(fs.readFileSync(optionsPath, 'utf8'));
    }
  } catch (err) {
    console.warn('[Manifest] Could not load filter-options.json:', err.message);
  }
  return null;
}

function getStudioOptions() {
  const options = loadFilterOptions();
  if (options?.studios?.withCounts) {
    const studioMap = new Map();
    for (const entry of options.studios.withCounts) {
      const match = entry.match(/^(.+?)\s*\((\d+)\)$/);
      if (!match) continue;
      const name = match[1].trim();
      const count = parseInt(match[2]);
      if (isSpamEntry(name) || count < 2) continue;
      const normalizedKey = normalizeName(name);
      const existing = studioMap.get(normalizedKey);
      if (!existing || count > existing.count) {
        studioMap.set(normalizedKey, { name, count, entry: `${name} (${count})` });
      }
    }
    return Array.from(studioMap.values())
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      .map(s => s.entry)
      .slice(0, 200);
  }
  return getDefaultStudioOptions();
}

function getYearOptions() {
  const options = loadFilterOptions();
  if (options?.years?.withCounts) {
    const yearMap = new Map();
    for (const opt of options.years.withCounts) {
      const match = opt.match(/^(\d{4})\s*\((\d+)\)$/);
      if (match) {
        const year = match[1];
        const count = parseInt(match[2]);
        const existing = yearMap.get(year);
        if (!existing || count > existing.count) {
          yearMap.set(year, { year, count });
        }
      }
    }
    return Array.from(yearMap.values())
      .sort((a, b) => parseInt(b.year) - parseInt(a.year))
      .filter(y => y.count > 0)
      .map(y => `${y.year} (${y.count})`);
  }
  return getDefaultYearOptions();
}

function getGenreOptions() {
  const options = loadFilterOptions();
  const GENRE_SYNONYMS = {
    '3d hentai': '3d', 'blow job': 'blowjob', 'boob job': 'paizuri',
    'tits fuck': 'paizuri', 'cream pie': 'creampie', 'foot job': 'footjob',
    'hand job': 'handjob', 'rim job': 'rimjob', 'school girl': 'schoolgirl',
    'school girls': 'schoolgirl', 'tentacle': 'tentacles', 'oral': 'oral sex',
    'big tits': 'big boobs', 'large breasts': 'big boobs', 'group': 'group sex'
  };
  
  const CANONICAL_GENRES = new Set([
    '3d', 'action', 'adventure', 'ahegao', 'anal', 'animal girls', 'bdsm',
    'big ass', 'big boobs', 'blackmail', 'blowjob', 'bondage', 'brainwashed',
    'bukkake', 'bunny girl', 'cat girl', 'censored', 'cheating', 'comedy',
    'condom', 'corruption', 'cosplay', 'cowgirl', 'creampie', 'cross-dressing',
    'cunnilingus', 'cute & funny', 'dark skin', 'deepthroat', 'demons', 'dildo',
    'doctor', 'doggy style', 'domination', 'double penetration', 'drama', 'drugs',
    'dubbed', 'ecchi', 'elf', 'eroge', 'facial', 'facesitting', 'fantasy',
    'female doctor', 'female teacher', 'femdom', 'filmed', 'fingering', 'footjob',
    'fox girl', 'furry', 'futanari', 'gangbang', 'glasses', 'group sex', 'gyaru',
    'handjob', 'harem', 'hd', 'historical', 'horror', 'horny slut', 'housewife',
    'humiliation', 'idol', 'incest', 'inflation', 'internal cumshot', 'lactation',
    'loli', 'magical girls', 'maid', 'martial arts', 'masturbation', 'megane',
    'milf', 'mind break', 'mind control', 'missionary', 'molestation', 'monster',
    'monster girl', 'nekomimi', 'non-japanese', 'ntr', 'nuns', 'nurse',
    'office ladies', 'oral sex', 'orc', 'orgy', 'paizuri', 'pantyhose', 'plot',
    'police', 'pov', 'pregnant', 'princess', 'prostitution', 'public sex',
    'rape', 'reverse cowgirl', 'reverse rape', 'rimjob', 'romance', 'scat',
    'schoolgirl', 'sci-fi', 'sex toys', 'shimapan', 'short', 'shota', 'sister',
    'slave', 'small breasts', 'softcore', 'sports', 'squirting', 'step daughter',
    'step mother', 'step sister', 'stocking', 'strap-on', 'succubus', 'super power',
    'supernatural', 'swimsuit', 'teacher', 'tentacles', 'threesome', 'toys',
    'train molestation', 'trap', 'tsundere', 'twin tail', 'twins', 'ugly bastard',
    'uncensored', 'urination', 'vampire', 'vanilla', 'virgin', 'watersports',
    'widow', 'x-ray', 'yaoi', 'yuri'
  ]);
  
  if (options?.genres?.withCounts) {
    const genreMap = new Map();
    for (const entry of options.genres.withCounts) {
      const match = entry.match(/^(.+?)\s*\((\d+)\)$/);
      if (!match) continue;
      const name = match[1].trim();
      const count = parseInt(match[2]);
      if (isSpamEntry(name)) continue;
      let normalizedKey = normalizeName(name);
      if (GENRE_SYNONYMS[normalizedKey]) {
        normalizedKey = GENRE_SYNONYMS[normalizedKey];
      }
      if (!CANONICAL_GENRES.has(normalizedKey)) continue;
      const existing = genreMap.get(normalizedKey);
      if (!existing) {
        const displayName = normalizedKey.split(' ').map(w => 
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join(' ');
        genreMap.set(normalizedKey, { name: displayName, count });
      } else {
        existing.count += count;
      }
    }
    return Array.from(genreMap.values())
      .filter(g => g.count >= 2)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      .map(g => `${g.name} (${g.count})`)
      .slice(0, 200);
  }
  return GENRE_OPTIONS;
}

function getTimePeriodOptions() {
  try {
    const databaseLoader = require('../utils/databaseLoader');
    if (databaseLoader.isReady()) {
      const db = databaseLoader.getCatalog();
      if (db && db.length > 0) {
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        
        const counts = { 'This Week': 0, 'This Month': 0, '3 Months': 0, 'This Year': 0 };
        for (const item of db) {
          const lastUpdated = item.lastUpdated || item.releaseInfo;
          if (!lastUpdated) continue;
          const itemDate = new Date(lastUpdated);
          if (isNaN(itemDate.getTime())) continue;
          if (itemDate >= oneWeekAgo) counts['This Week']++;
          if (itemDate >= oneMonthAgo) counts['This Month']++;
          if (itemDate >= threeMonthsAgo) counts['3 Months']++;
          if (itemDate >= oneYearAgo) counts['This Year']++;
        }
        return ['None', ...Object.entries(counts).map(([period, count]) => `${period} (${count})`)];
      }
    }
  } catch (err) {}
  
  const options = loadFilterOptions();
  if (options?.timePeriods?.withCounts) {
    return ['None', ...options.timePeriods.withCounts];
  }
  return ["None", "This Week", "This Month", "3 Months", "This Year"];
}

function getDefaultStudioOptions() {
  return ["Pink Pineapple", "Queen Bee", "Mary Jane", "PoRO", "T-Rex", "Green Bunny", "Vanilla"];
}

function getDefaultYearOptions() {
  const years = [];
  for (let y = 2026; y >= 1990; y--) years.push(String(y));
  return years;
}

const STUDIO_OPTIONS = getStudioOptions();
const YEAR_OPTIONS = getYearOptions();
const DYNAMIC_GENRE_OPTIONS = getGenreOptions();

function getBaseManifest() {
  return {
    id: config.addon.id,
    version: config.addon.version,
    name: config.addon.name,
    description: config.addon.description,
    
    resources: [
      'catalog',
      {
        name: 'meta',
        types: ['hentai'], // Explicitly updated to match metadata type
        idPrefixes: ['hmm-', 'hse-', 'htv-', 'hs-']
      },
      {
        name: 'stream',
        types: ['hentai'], // Explicitly updated to match metadata type
        idPrefixes: ['hmm-', 'hse-', 'htv-', 'hs-']
      }
    ],
    
    types: ['hentai'], // Standardized completely to hentai
    idPrefixes: ['hmm-', 'hse-', 'htv-', 'hs-'],
    
    catalogs: [
      {
        type: 'hentai',
        id: 'hentai-top-rated',
        name: 'Top Rated',
        extra: [{ name: 'skip' }, { name: 'genre', options: DYNAMIC_GENRE_OPTIONS }],
        behaviorHints: { notForHome: true }
      },
      {
        type: 'hentai',
        id: 'hentai-monthly',
        name: 'New Releases',
        extra: [{ name: 'skip' }, { name: 'genre', options: getTimePeriodOptions() }],
        behaviorHints: { notForHome: true }
      },
      {
        type: 'hentai',
        id: 'hentai-studios',
        name: 'Studios',
        extra: [{ name: 'skip' }, { name: 'genre', options: STUDIO_OPTIONS }],
        behaviorHints: { notForHome: true }
      },
      {
        type: 'hentai',
        id: 'hentai-years',
        name: 'Release Year',
        extra: [{ name: 'skip' }, { name: 'genre', options: YEAR_OPTIONS }],
        behaviorHints: { notForHome: true }
      },
      {
        type: 'hentai',
        id: 'hentai-all',
        name: 'All Hentai',
        extra: [{ name: 'skip' }, { name: 'genre', options: DYNAMIC_GENRE_OPTIONS }],
        behaviorHints: { notForHome: true }
      },
      {
        type: 'hentai',
        id: 'hentai-search',
        name: 'Search',
        extra: [{ name: 'search', isRequired: true }, { name: 'skip' }],
        behaviorHints: { notForHome: true }
      }
    ],
  
    background: `${config.server.baseUrl}/logo.png`,
    logo: `${config.server.baseUrl}/logo.png`,
    contactEmail: '',
    
    behaviorHints: {
      adult: true,
      configurable: true,
      configurationRequired: false,
    },
    
    stremioAddonsConfig: {
      issuer: "https://stremio-addons.net",
      signature: "eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..XsFMxPKmoU1Ds0JM-xqn7Q.gFOIqMqNjBx0fMu-WcWvUWV6Xk6DJFTNMtSFIUNrZnCwBJhmsUa5bnP5t7B7DsHwGdxOIajHnn0WhZhdSVUnRYpM1emw1gBmgqCS8gTztvmyKKJ1iQn8gPj3q3Vxtu4w.dkqifJARWq30iDu-Kj3noA"
    }
  };
}

async function getManifest() {
  return getBaseManifest();
}

module.exports = getBaseManifest();
module.exports.getManifest = getManifest;
module.exports.GENRE_OPTIONS = GENRE_OPTIONS;
module.exports.STUDIO_OPTIONS = STUDIO_OPTIONS;
module.exports.YEAR_OPTIONS = YEAR_OPTIONS;
