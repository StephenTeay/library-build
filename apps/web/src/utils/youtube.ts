/**
 * Extracts a YouTube video ID from various YouTube URL formats or raw ID.
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - Raw 11-character video ID (e.g. 8mAITcNt710)
 */
export function extractYouTubeVideoId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Direct 11-character video ID regex check
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v && v.length === 11) return v;
      if (url.pathname.startsWith('/embed/')) {
        const seg = url.pathname.split('/')[2];
        if (seg && seg.length >= 11) return seg.slice(0, 11);
      }
    } else if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.slice(1).split('?')[0];
      if (id && id.length === 11) return id;
    }
  } catch {
    // If not a standard URL, try regex
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match) return match[1];
  }

  return null;
}

export function getYouTubeEmbedUrl(videoId: string, startSeconds = 0): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&start=${startSeconds || 0}`;
}
