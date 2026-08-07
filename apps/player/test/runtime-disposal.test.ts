import { describe, expect, it } from "vitest";

import {
  RuntimeDisposalCoordinator,
  parseRuntimeDisposalAcknowledgement,
} from "../src/runtime/runtime-disposal";

function acknowledgement(
  requestId: string,
  outcome:
    | { readonly status: "disposed" }
    | { readonly status: "failed"; readonly code: "runtime-disposal-cleanup-failed" },
): string {
  return JSON.stringify({
    version: 1,
    requestId,
    type: "runtime.disposed",
    payload: outcome,
  });
}

describe("runtime disposal coordinator", () => {
  it("shares one correlated request and accepts its exact acknowledgement", async () => {
    const coordinator = new RuntimeDisposalCoordinator("run-1:release-1");
    const injections: string[] = [];

    const first = coordinator.request((script) => injections.push(script));
    const second = coordinator.request((script) => injections.push(script));
    expect(second).toBe(first);
    expect(injections).toHaveLength(1);

    const requestId = coordinator.activeRequestId();
    expect(requestId).not.toBeNull();
    expect(coordinator.consume(acknowledgement(requestId!, { status: "disposed" }))).toBe(true);
    await expect(first).resolves.toEqual({ status: "disposed" });
  });

  it("rejects malformed, wrong, duplicate, and late acknowledgements", async () => {
    const coordinator = new RuntimeDisposalCoordinator("run-2:release-2");
    const disposal = coordinator.request(() => undefined);
    const requestId = coordinator.activeRequestId();
    if (requestId === null) throw new Error("runtime-disposal-test-request-missing");

    expect(coordinator.consume("not-json")).toBe(false);
    expect(
      coordinator.consume(acknowledgement("another-mount:dispose:1", { status: "disposed" })),
    ).toBe(false);
    expect(
      coordinator.consume(
        JSON.stringify({
          version: 1,
          requestId,
          type: "runtime.disposed",
          payload: { status: "disposed", extra: true },
        }),
      ),
    ).toBe(false);
    expect(coordinator.consume(acknowledgement(requestId, { status: "disposed" }))).toBe(true);
    expect(coordinator.consume(acknowledgement(requestId, { status: "disposed" }))).toBe(false);
    await expect(disposal).resolves.toEqual({ status: "disposed" });

    const replacement = new RuntimeDisposalCoordinator("run-3:release-3");
    const replacementDisposal = replacement.request(() => undefined);
    expect(replacement.consume(acknowledgement(requestId, { status: "disposed" }))).toBe(false);
    replacement.processTerminated("runtime-webview-content-process-terminated");
    await expect(replacementDisposal).resolves.toEqual({
      status: "failed",
      code: "runtime-webview-content-process-terminated",
    });
  });

  it("settles a missing acknowledgement only after explicit native process failure", async () => {
    const coordinator = new RuntimeDisposalCoordinator("run-4:release-4");
    let settled = false;
    const disposal = coordinator
      .request(() => undefined)
      .then((outcome) => {
        settled = true;
        return outcome;
      });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(coordinator.processTerminated("runtime-webview-render-process-gone")).toBe(true);
    await expect(disposal).resolves.toEqual({
      status: "failed",
      code: "runtime-webview-render-process-gone",
    });
  });

  it("does not release the mount when request injection fails", async () => {
    const coordinator = new RuntimeDisposalCoordinator("run-5:release-5");
    expect(() =>
      coordinator.request(() => {
        throw new Error("native-injection-detail");
      }),
    ).toThrow("runtime-disposal-injection-failed");
    expect(coordinator.activeRequestId()).toBeNull();

    const disposal = coordinator.request(() => undefined);
    const requestId = coordinator.activeRequestId();
    if (requestId === null) throw new Error("runtime-disposal-test-request-missing");
    coordinator.consume(acknowledgement(requestId, { status: "disposed" }));
    await expect(disposal).resolves.toEqual({ status: "disposed" });
  });

  it("parses only closed stable failure codes", () => {
    expect(
      parseRuntimeDisposalAcknowledgement(
        acknowledgement("request-1", {
          status: "failed",
          code: "runtime-disposal-cleanup-failed",
        }),
      ),
    ).toMatchObject({ requestId: "request-1", payload: { status: "failed" } });
    expect(
      parseRuntimeDisposalAcknowledgement(
        JSON.stringify({
          version: 1,
          requestId: "request-1",
          type: "runtime.disposed",
          payload: { status: "failed", code: "arbitrary-exception-text" },
        }),
      ),
    ).toBeNull();
  });
});
