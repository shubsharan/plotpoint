import { describe, expect, it } from "vitest";

import {
  accuracyBand,
  isEligibleInstallUrl,
  parseHostBridgeEnvelope,
  parseInstallDescriptor,
} from "../src/index.js";

const releaseId = `sha256:${"a".repeat(64)}`;

describe("install descriptor", () => {
  it("accepts only closed private-network HTTP descriptors", () => {
    expect(
      parseInstallDescriptor({
        version: 1,
        releaseUrl: "http://192.168.1.4:4100/release.pprelease",
        expectedReleaseId: releaseId,
      }).kind,
    ).toBe("valid");
    expect(isEligibleInstallUrl("https://192.168.1.4/release.pprelease")).toBe(false);
    expect(isEligibleInstallUrl("http://8.8.8.8/release.pprelease")).toBe(false);
    expect(isEligibleInstallUrl("http://user:pass@127.0.0.1/release.pprelease")).toBe(false);
    expect(
      parseInstallDescriptor({
        version: 1,
        releaseUrl: "http://127.0.0.1/release.pprelease",
        expectedReleaseId: releaseId,
        label: "unexpected",
      }).kind,
    ).toBe("invalid");
  });
});

describe("host bridge", () => {
  it("accepts closed versioned canonical envelopes", () => {
    expect(
      parseHostBridgeEnvelope({
        version: 1,
        requestId: "request-1",
        type: "runtime.ready",
        payload: {},
      }).kind,
    ).toBe("valid");
    expect(
      parseHostBridgeEnvelope({
        version: 2,
        requestId: "request-1",
        type: "runtime.ready",
        payload: {},
      }),
    ).toEqual({ kind: "invalid", code: "bridge-version-unsupported" });
  });
});

describe("report policy", () => {
  it("maps precision to redacted bands", () => {
    expect(accuracyBand(4)).toBe("excellent");
    expect(accuracyBand(25)).toBe("good");
    expect(accuracyBand(80)).toBe("degraded");
    expect(accuracyBand(undefined)).toBe("unknown");
  });
});
