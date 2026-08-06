interface MediaContent {
  readonly assetId: string;
  readonly caption: string;
  readonly title: string;
}

interface ComponentContext {
  readonly lifecycle: { defer(cleanup: () => void | Promise<void>): void };
  readonly content: Readonly<Record<string, unknown>>;
  readonly local: {
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

function mediaContent(value: unknown): MediaContent {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("assetId" in value) ||
    !("caption" in value) ||
    !("title" in value) ||
    typeof value.assetId !== "string" ||
    typeof value.caption !== "string" ||
    typeof value.title !== "string"
  ) {
    throw new Error("tour-media-content-invalid");
  }
  return value as MediaContent;
}

export function MediaPanel(context: ComponentContext): HTMLElement {
  const media = mediaContent(context.content["tour.media.river"]);
  const playMedia = context.local.commands["tour.play-media"];
  if (playMedia === undefined) throw new Error("tour-play-media-command-missing");

  const panel = document.createElement("figure");
  panel.dataset.component = "tour.media-panel";
  panel.dataset.assetId = media.assetId;
  const caption = document.createElement("figcaption");
  caption.textContent = `${media.title}: ${media.caption}`;
  const button = document.createElement("button");
  button.textContent = "Play audio";
  const onPlay = () => {
    void playMedia.execute({
      commandId: globalThis.crypto.randomUUID(),
      payload: { mediaId: "tour.media.river" },
    });
  };
  button.addEventListener("click", onPlay);
  context.lifecycle.defer(() => button.removeEventListener("click", onPlay));
  panel.append(caption, button);
  return panel;
}
