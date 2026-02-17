import { getCoreEnv } from "@/lib/server/env";

type PartialArtworkMediaUrls = {
  photo_day_url?: string;
  photo_night_url?: string;
  audio_url_ko?: string;
  audio_url_en?: string;
};

type ArtworkMediaUrls = {
  photo_day_url: string;
  photo_night_url: string;
  audio_url_ko: string;
  audio_url_en: string;
};

export function buildMockArtworkMediaUrls(seed: string): ArtworkMediaUrls {
  const env = getCoreEnv();
  const baseUrl = env.MOCK_MEDIA_BASE_URL.replace(/\/+$/, "");
  const safeSeed = seed.replace(/[^a-zA-Z0-9_-]/g, "-");

  return {
    photo_day_url: `${baseUrl}/artworks/${safeSeed}/photo-day.jpg`,
    photo_night_url: `${baseUrl}/artworks/${safeSeed}/photo-night.jpg`,
    audio_url_ko: `${baseUrl}/artworks/${safeSeed}/audio-ko.mp3`,
    audio_url_en: `${baseUrl}/artworks/${safeSeed}/audio-en.mp3`,
  };
}

export function resolveArtworkMediaUrls(options: {
  input?: PartialArtworkMediaUrls;
  existing?: PartialArtworkMediaUrls;
  seed: string;
}): ArtworkMediaUrls {
  const fallback = buildMockArtworkMediaUrls(options.seed);

  return {
    photo_day_url:
      options.input?.photo_day_url ??
      options.existing?.photo_day_url ??
      fallback.photo_day_url,
    photo_night_url:
      options.input?.photo_night_url ??
      options.existing?.photo_night_url ??
      fallback.photo_night_url,
    audio_url_ko:
      options.input?.audio_url_ko ??
      options.existing?.audio_url_ko ??
      fallback.audio_url_ko,
    audio_url_en:
      options.input?.audio_url_en ??
      options.existing?.audio_url_en ??
      fallback.audio_url_en,
  };
}
