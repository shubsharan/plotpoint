export interface SceneSummary {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
}

export function SceneNavigator(scenes: readonly SceneSummary[]): HTMLElement {
  const navigation = document.createElement("nav");
  navigation.dataset.component = "tour.scene-navigator.v1";
  for (const scene of scenes) {
    const button = document.createElement("button");
    button.dataset.sceneId = scene.id;
    button.textContent = `${scene.title}: ${scene.summary}`;
    navigation.append(button);
  }
  return navigation;
}
