import "server-only";
import { AppError } from "@/shared/errors";

const ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const PATH_PREFIXES = ["/shorts/", "/embed/", "/live/", "/v/"];

/**
 * Extracts the 11-char video id from a YouTube URL. Only allowlisted hosts are accepted, so the server
 * never fetches a user-supplied host (SSRF guard). Extra params (t, list, si) are ignored.
 */
export function parseYouTubeUrl(input: string): string {
  const invalid = () => new AppError("YOUTUBE_INVALID_URL");
  const raw = input.trim();
  if (!raw || raw.length > 2048) throw invalid();

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw invalid();
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw invalid();
  if (url.username || url.password || url.port) throw invalid();

  const host = url.hostname.toLowerCase();
  let id: string | null = null;

  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else {
      const prefix = PATH_PREFIXES.find((p) => url.pathname.startsWith(p));
      if (prefix) id = url.pathname.slice(prefix.length).split("/")[0] ?? null;
    }
  }

  if (!id || !ID.test(id)) throw invalid();
  return id;
}

export function canonicalUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
