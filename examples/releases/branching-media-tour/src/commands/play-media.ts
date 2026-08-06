import { defineCommand, type JsonObject } from "@plotpoint/runtime";

import type { TourState } from "./choose-scene.js";

export type PlayMediaPayload = JsonObject & { readonly mediaId: string };
export type PlayMediaOutcome = JsonObject & { readonly queued: boolean };

export const playMediaCommand = defineCommand<
  "player",
  TourState,
  PlayMediaPayload,
  PlayMediaOutcome
>({
  definitionId: "tour.play-media",
  commandType: "play-media",
  aggregateKind: "player",
  handle(target, command) {
    return {
      kind: "accepted",
      nextState: target.state,
      outcome: { queued: true },
      domainEvents: [{ type: "tour.media-requested", mediaId: command.payload.mediaId }],
      effectIntents: [{ type: "tour.play-audio", mediaId: command.payload.mediaId }],
      progressionIntents: [],
    };
  },
});
