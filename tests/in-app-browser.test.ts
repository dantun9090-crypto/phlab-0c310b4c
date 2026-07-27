import { describe, expect, it } from "vitest";

import {
  detectInAppBrowser,
  isInAppBrowser,
  openExternallyHint,
} from "@/lib/in-app-browser";

const UA = {
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0",
  facebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]",
  tiktok:
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 BytedanceWebview/d8a21c6",
  safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  desktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

describe("detectInAppBrowser", () => {
  it("flags social in-app webviews that cannot open banking apps", () => {
    expect(detectInAppBrowser(UA.instagram)).toBe("Instagram");
    expect(detectInAppBrowser(UA.facebook)).toBe("Facebook");
    expect(detectInAppBrowser(UA.tiktok)).toBe("TikTok");
  });

  it("does not flag real browsers", () => {
    expect(detectInAppBrowser(UA.safari)).toBeNull();
    expect(detectInAppBrowser(UA.chromeAndroid)).toBeNull();
    expect(detectInAppBrowser(UA.desktop)).toBeNull();
    expect(isInAppBrowser(UA.safari)).toBe(false);
  });

  it("returns null for an empty user agent", () => {
    expect(detectInAppBrowser("")).toBeNull();
  });
});

describe("openExternallyHint", () => {
  it("gives platform-specific escape instructions", () => {
    expect(openExternallyHint(UA.instagram)).toMatch(/Safari/);
    expect(openExternallyHint(UA.tiktok)).toMatch(/Chrome/);
    expect(openExternallyHint(UA.desktop)).toMatch(/normal browser/);
  });
});
