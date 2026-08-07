interface ApplicationElement {
  remove(): void;
}

interface ApplicationRoot {
  replaceChildren(...children: ApplicationElement[]): void;
}

interface GameApplicationContext {
  readonly root: ApplicationRoot;
  readonly components: Readonly<Record<string, () => ApplicationElement>>;
}

export const coOpApplication = Object.freeze({
  mount({ root, components }: GameApplicationContext) {
    const clueBoard = components["co-op.clue-board"];
    const sessionConsole = components["co-op.session-console"];
    if (clueBoard === undefined || sessionConsole === undefined) {
      throw new Error("co-op-component-missing");
    }
    const elements = [clueBoard(), sessionConsole()];
    root.replaceChildren(...elements);
    return Object.freeze({
      unmount() {
        root.replaceChildren();
      },
    });
  },
});
