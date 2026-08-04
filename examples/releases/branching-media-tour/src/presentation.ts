import { MediaPanel } from "./components/media-panel.js";
import { SceneNavigator } from "./components/scene-navigator.js";

export { MediaPanel } from "./components/media-panel.js";
export { SceneNavigator } from "./components/scene-navigator.js";

export const presentation = Object.freeze({
  components: Object.freeze({
    "tour.media-panel.v1": MediaPanel,
    "tour.scene-navigator.v1": SceneNavigator,
  }),
});
