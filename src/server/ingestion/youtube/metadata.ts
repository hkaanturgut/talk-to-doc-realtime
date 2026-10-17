import "server-only";
import { z } from "zod";
import { canonicalUrl } from "./url";
import type { FetchFn } from "./types";

const OEmbed = z.object({ title: z.string().min(1), author_name: z.string().optional() });

export interface VideoMetadata {
  title: string;
  channel?: string;
}

/** Title and channel from YouTube oEmbed (no key). Never fails: falls back to "YouTube video". */
export async function fetchMetadata(videoId: string, fetchFn: FetchFn = fetch): Promise<VideoMetadata> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl(videoId))}`;
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { title: "YouTube video" };
    const parsed = OEmbed.safeParse(await res.json());
    if (!parsed.success) return { title: "YouTube video" };
    return { title: parsed.data.title.slice(0, 200), channel: parsed.data.author_name };
  } catch {
    return { title: "YouTube video" };
  }
}
