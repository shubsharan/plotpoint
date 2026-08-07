declare module "node:sqlite" {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;

  interface StatementSync {
    run(...parameters: SQLInputValue[]): unknown;
    all(...parameters: SQLInputValue[]): unknown[];
    get(...parameters: SQLInputValue[]): unknown;
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(query: string): void;
    prepare(query: string): StatementSync;
    close(): void;
  }
}

declare module "node:fs/promises" {
  export function access(path: URL): Promise<void>;
  export function readFile(path: URL, encoding: "utf8"): Promise<string>;
}
