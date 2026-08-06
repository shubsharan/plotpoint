import type { JsonObject } from "@plotpoint/runtime";

import type { TourState } from "./commands/choose-scene.js";

export function initializeTour(_input: JsonObject): TourState {
  return Object.freeze({ currentScene: "garden", visitedScenes: Object.freeze(["garden"]) });
}
