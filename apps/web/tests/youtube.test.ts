import { describe, it, expect } from 'vitest';
import { extractYouTubeVideoId, getYouTubeEmbedUrl } from '../src/utils/youtube';

describe('YouTube In-Browser Utilities', () => {
  it('extracts video ID from standard watch URL', () => {
    const url = 'https://www.youtube.com/watch?v=8mAITcNt710';
    expect(extractYouTubeVideoId(url)).toBe('8mAITcNt710');
  });

  it('extracts video ID from short youtu.be URL', () => {
    const url = 'https://youtu.be/TZPyOJ8tFcI?si=2lwnSCSpXAAAa8Fg';
    expect(extractYouTubeVideoId(url)).toBe('TZPyOJ8tFcI');
  });

  it('extracts video ID from embed URL', () => {
    const url = 'https://www.youtube.com/embed/jGwO_UgTS7I';
    expect(extractYouTubeVideoId(url)).toBe('jGwO_UgTS7I');
  });

  it('accepts raw 11-character video ID', () => {
    expect(extractYouTubeVideoId('aircAruvnKk')).toBe('aircAruvnKk');
  });

  it('returns null for invalid or non-YouTube inputs', () => {
    expect(extractYouTubeVideoId('https://example.com/video.mp4')).toBeNull();
    expect(extractYouTubeVideoId('')).toBeNull();
    expect(extractYouTubeVideoId(null)).toBeNull();
  });

  it('generates zero-cookie embed URL for in-browser playback', () => {
    const embedUrl = getYouTubeEmbedUrl('8mAITcNt710', 45);
    expect(embedUrl).toBe('https://www.youtube-nocookie.com/embed/8mAITcNt710?autoplay=1&start=45');
  });
});
