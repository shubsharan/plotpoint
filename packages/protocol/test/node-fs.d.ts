declare module "node:fs/promises" {
  interface Dirent {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export function access(path: URL): Promise<void>;
  export function readFile(path: URL, encoding: "utf8"): Promise<string>;
  export function readdir(
    path: URL,
    options: { readonly withFileTypes: true },
  ): Promise<readonly Dirent[]>;
}
