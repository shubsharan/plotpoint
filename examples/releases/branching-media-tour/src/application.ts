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

export const tourApplication = Object.freeze({
  mount({ root, components }: GameApplicationContext) {
    const mediaPanel = components["tour.media-panel"];
    const sceneNavigator = components["tour.scene-navigator"];
    if (mediaPanel === undefined || sceneNavigator === undefined) {
      throw new Error("tour-component-missing");
    }
    const elements = [sceneNavigator(), mediaPanel()];
    root.replaceChildren(...elements);
    return Object.freeze({
      unmount() {
        root.replaceChildren();
      },
    });
  },
});
