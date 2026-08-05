export interface MediaSummary {
  readonly assetId: string;
  readonly caption: string;
  readonly title: string;
}

export function MediaPanel(media: MediaSummary): HTMLElement {
  const panel = document.createElement("figure");
  panel.dataset.component = "tour.media-panel";
  panel.dataset.assetId = media.assetId;
  const caption = document.createElement("figcaption");
  caption.textContent = `${media.title}: ${media.caption}`;
  panel.append(caption);
  return panel;
}
