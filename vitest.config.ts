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
            "@plotpoint/compiler": new URL("./packages/compiler/src/index.ts", import.meta.url)
              .pathname,
            "@plotpoint/modules": new URL("./packages/modules/src/index.ts", import.meta.url)
              .pathname,
            "@plotpoint/protocol": new URL("./packages/protocol/src/index.ts", import.meta.url)
              .pathname,
            "@plotpoint/runtime": new URL("./packages/runtime/src/index.ts", import.meta.url)
              .pathname,
          },
        },
        test: {
          ...sharedTestConfig,
          name: "compiler",
          passWithNoTests: true,
          root: `${workspaceRoot}packages/compiler`,
          include: ["test/**/*.test.ts"],
        },
      }),
      defineProject({
        resolve: {
          alias: {
            "@plotpoint/protocol": new URL("./packages/protocol/src/index.ts", import.meta.url)
              .pathname,
            "@plotpoint/runtime": new URL("./packages/runtime/src/index.ts", import.meta.url)
              .pathname,
          },
        },
        test: {
          ...sharedTestConfig,
          name: "protocol",
          passWithNoTests: true,
          root: `${workspaceRoot}packages/protocol`,
          include: ["test/**/*.test.ts"],
        },
      }),
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
          include: ["test/**/*.test.ts"],
          benchmark: {
            include: ["test/**/*.bench.ts"],
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
          include: ["test/**/*.test.ts"],
        },
      }),
    ],
  },
});
