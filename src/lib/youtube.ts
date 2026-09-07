const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function parseUrlLoose(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

/**
 * Extracts a YouTube video id from common URL formats:
 * youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
 * (with or without www/m/music subdomains, with or without a scheme).
 * Returns null for anything else — callers should fall back gracefully.
 */
export function getYouTubeVideoId(rawUrl: string): string | null {
  const url = parseUrlLoose(rawUrl);
  if (!url) return null;

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
    }
    const match = url.pathname.match(/^\/(embed|shorts)\/([^/]+)/);
    if (match) {
      const id = match[2];
      return YOUTUBE_ID_PATTERN.test(id) ? id : null;
    }
  }

  return null;
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
