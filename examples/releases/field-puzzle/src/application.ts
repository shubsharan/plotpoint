export interface FieldApplicationContext {
  readonly root: HTMLElement;
  readonly components: Readonly<{
    "field.puzzle": () => HTMLElement;
  }>;
}

export interface FieldApplicationHandle {
  unmount(): void;
}

export const fieldApplication = Object.freeze({
  mount(context: FieldApplicationContext): FieldApplicationHandle {
    const element = context.components["field.puzzle"]();
    context.root.replaceChildren(element);
    return Object.freeze({
      unmount(): void {
        element.remove();
      },
    });
  },
});
