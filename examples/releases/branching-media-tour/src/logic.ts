import { chooseSceneCommand } from "./commands/choose-scene.js";
import { playMediaCommand } from "./commands/play-media.js";
import { routeProgression } from "./progression/route.js";

export const logic = Object.freeze({
  commands: Object.freeze([chooseSceneCommand, playMediaCommand]),
  progressions: Object.freeze([routeProgression]),
});
