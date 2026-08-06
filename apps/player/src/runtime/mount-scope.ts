export type MountCleanup = () => void | Promise<void>;

export class MountScopeCleanupError extends Error {
  readonly failures: readonly unknown[];

  constructor(failures: readonly unknown[]) {
    super("runtime-mount-cleanup-failed");
    this.failures = Object.freeze([...failures]);
  }
}

export interface MountScope {
  readonly lifecycle: {
    defer(cleanup: MountCleanup): void;
  };
  closeRegistration(): void;
  dispose(): Promise<void>;
}

export function createMountScope(): MountScope {
  const cleanups: MountCleanup[] = [];
  let accepting = true;
  let disposal: Promise<void> | undefined;

  const dispose = (): Promise<void> => {
    if (disposal !== undefined) return disposal;
    accepting = false;
    disposal = (async () => {
      const failures: unknown[] = [];
      for (const cleanup of cleanups.reverse()) {
        try {
          await cleanup();
        } catch (error) {
          failures.push(error);
        }
      }
      cleanups.length = 0;
      if (failures.length > 0) throw new MountScopeCleanupError(failures);
    })();
    return disposal;
  };

  return Object.freeze({
    lifecycle: Object.freeze({
      defer(cleanup: MountCleanup): void {
        if (!accepting) throw new Error("runtime-mount-scope-closed");
        if (typeof cleanup !== "function") throw new Error("runtime-component-cleanup-invalid");
        cleanups.push(cleanup);
      },
    }),
    closeRegistration(): void {
      accepting = false;
    },
    dispose,
  });
}
