import { defineConfig, defineProject } from "vitest/config";

const sharedTestConfig = {
  environment: "node" as const,
  isolate: true,
  sequence: {
    shuffle: false,
  },
};

const workspaceRoot = new URL("./", import.meta.url).pathname;

export default defineConfig({
  test: {
    projects: [
      defineProject({
        resolve: {
          alias: {
            "@plotpoint/runtime": new URL("./packages/runtime/src/index.ts", import.meta.url)
              .pathname,
          },
        },
        test: {
          ...sharedTestConfig,
          name: "runtime",
          root: `${workspaceRoot}packages/runtime`,
          include: ["src/**/*.test.ts"],
          benchmark: {
            include: ["src/**/*.bench.ts"],
          },
        },
      }),
      defineProject({
        resolve: {
          alias: {
            "@plotpoint/runtime": new URL("./packages/runtime/src/index.ts", import.meta.url)
              .pathname,
            "@plotpoint/testkit": new URL("./packages/testkit/src/index.ts", import.meta.url)
              .pathname,
          },
        },
        test: {
          ...sharedTestConfig,
          name: "testkit",
          root: `${workspaceRoot}packages/testkit`,
          include: ["src/**/*.test.ts"],
        },
      }),
    ],
  },
});
