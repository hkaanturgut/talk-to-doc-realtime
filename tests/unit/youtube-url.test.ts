import { describe, expect, it } from "vitest";
import { parseYouTubeUrl } from "@/server/ingestion/youtube/url";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeUrl", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42s`,
    `https://www.youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `https://www.youtube.com/watch?feature=share&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abcdef&t=10`,
    `youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?si=x`,
    `https://www.youtube.com/v/${ID}`,
    `  https://www.youtube.com/watch?v=${ID}  `,
    `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`,
  ])("accepts %s", (url) => {
    expect(parseYouTubeUrl(url)).toBe(ID);
  });

  it.each([
    "",
    "not a url",
    `https://evil.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    `https://notyoutube.com/watch?v=${ID}`,
    `https://youtu.be.evil.com/${ID}`,
    `https://www.youtube.com/watch?v=short`,
    `https://www.youtube.com/watch?v=${ID}xx`,
    `https://www.youtube.com/channel/UC123`,
    `https://www.youtube.com/`,
    `ftp://youtube.com/watch?v=${ID}`,
    `javascript:alert(1)//youtube.com/watch?v=${ID}`,
    `https://user:pass@youtube.com/watch?v=${ID}`,
    `https://youtube.com:8443/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID.slice(0, 10)}!`,
  ])("rejects %s", (url) => {
    expect(() => parseYouTubeUrl(url)).toThrow(expect.objectContaining({ code: "YOUTUBE_INVALID_URL" }));
  });
});
