import { defineCommand, type JsonObject } from "@plotpoint/runtime";

export type TourState = JsonObject & {
  readonly currentScene: string;
  readonly visitedScenes: readonly string[];
};

export type ChooseScenePayload = JsonObject & { readonly sceneId: string };
export type ChooseSceneOutcome = JsonObject & {
  readonly sceneId: string;
  readonly visitedCount: number;
};

export const chooseSceneCommand = defineCommand<
  "player",
  TourState,
  ChooseScenePayload,
  ChooseSceneOutcome
>({
  definitionId: "tour.choose-scene",
  commandType: "choose-scene",
  aggregateKind: "player",
  handle(target, command) {
    const visitedScenes = target.state.visitedScenes.includes(command.payload.sceneId)
      ? target.state.visitedScenes
      : [...target.state.visitedScenes, command.payload.sceneId];
    return {
      kind: "accepted",
      nextState: { currentScene: command.payload.sceneId, visitedScenes },
      outcome: { sceneId: command.payload.sceneId, visitedCount: visitedScenes.length },
      domainEvents: [{ type: "tour-scene-chosen", sceneId: command.payload.sceneId }],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});
