interface SceneContent {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
}

interface ComponentContext {
  readonly lifecycle: { defer(cleanup: () => void | Promise<void>): void };
  readonly content: Readonly<Record<string, unknown>>;
  readonly local: {
    getView(): Promise<unknown>;
    onChanged(listener: () => void): () => void;
    readonly commands: Readonly<
      Record<
        string,
        {
          execute(input: {
            readonly commandId: string;
            readonly payload: object;
          }): Promise<unknown>;
        }
      >
    >;
  };
}

function sceneContent(value: unknown): SceneContent {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("id" in value) ||
    !("title" in value) ||
    !("summary" in value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.summary !== "string"
  ) {
    throw new Error("tour-scene-content-invalid");
  }
  return value as SceneContent;
}

export function SceneNavigator(context: ComponentContext): HTMLElement {
  const chooseScene = context.local.commands["tour.choose-scene"];
  if (chooseScene === undefined) throw new Error("tour-choose-scene-command-missing");
  const scenes = [
    sceneContent(context.content["tour.scene.garden"]),
    sceneContent(context.content["tour.scene.harbor"]),
  ];
  const navigation = document.createElement("nav");
  navigation.dataset.component = "tour.scene-navigator";
  for (const scene of scenes) {
    const button = document.createElement("button");
    button.dataset.sceneId = scene.id;
    button.textContent = `${scene.title}: ${scene.summary}`;
    const onChoose = () => {
      void chooseScene.execute({
        commandId: globalThis.crypto.randomUUID(),
        payload: { sceneId: scene.id },
      });
    };
    button.addEventListener("click", onChoose);
    context.lifecycle.defer(() => button.removeEventListener("click", onChoose));
    navigation.append(button);
  }
  context.lifecycle.defer(context.local.onChanged(() => void context.local.getView()));
  return navigation;
}
