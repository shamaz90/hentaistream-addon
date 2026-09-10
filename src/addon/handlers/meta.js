// Transform to Stremio meta format
    const meta = {
      id: data.seriesId || data.id,
      type: 'hentai', // FIXED: Changed from 'series' to 'hentai'
      name: data.name,
      poster: data.poster ? proxyImage(data.poster) : undefined,
      background: data.poster ? proxyImage(data.poster) : undefined,
      logo: data.logo ? proxyImage(data.logo) : undefined,
      description: cleanDescription, // Rating breakdown intentionally not shown - only for internal use
      releaseInfo: data.releaseInfo || data.year || undefined,
      // Show rating in runtime field (avoids IMDb logo)
      // Always shows a rating - either numeric or "★ N/A"
      runtime: displayRating,
      // Keep genres array for backwards compatibility and catalog filtering
      genres: genres.length > 0 ? genres : undefined,
      // Links array with BOTH genres and studio - this is what Stremio displays
      links: allLinks.length > 0 ? allLinks : undefined,
      // Build videos array from episodes with individual thumbnails and release dates
      // Handle both old format (episodeNumber) and new format (number)
      // NOTE: RAW status is shown in STREAM name, not episode title
      // CRITICAL: Use series ID (data.seriesId or data.id), NOT episode ID (ep.id)
      // ep.id contains the episode slug (like "hmm-series-name-episode-1")
      // Video IDs must be "{series_id}:1:{episode_num}" for proper stream routing
      videos: (data.episodes || []).map(ep => {
        const epNum = ep.number || ep.episodeNumber || 1;
        const epTitle = ep.title || ep.name || `Episode ${epNum}`;
        const seriesId = data.seriesId || data.id; // Use series ID, not episode ID
        const rawThumb = ep.poster || data.poster;
        return {
          id: `${seriesId}:1:${epNum}`,
          title: epTitle,
          season: 1,
          episode: epNum,
          thumbnail: rawThumb ? proxyImage(rawThumb) : undefined, // Proxy episode thumbnail
          released: ep.released || undefined, // Add release date (ISO string) for Stremio display
        };
      }),
    };
