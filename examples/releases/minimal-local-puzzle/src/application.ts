export interface MinimalApplicationContext {
  readonly root: HTMLElement;
  readonly components: Readonly<{
    "minimal.puzzle-card": () => HTMLElement;
  }>;
}

export interface MinimalApplicationHandle {
  unmount(): void;
}

export const minimalApplication = Object.freeze({
  mount(context: MinimalApplicationContext): MinimalApplicationHandle {
    const element = context.components["minimal.puzzle-card"]();
    context.root.replaceChildren(element);
    return Object.freeze({
      unmount(): void {
        element.remove();
      },
    });
  },
});
