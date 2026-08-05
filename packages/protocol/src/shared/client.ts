import type { CanonicalJsonObject } from "../release/types.js";
import type { SharedCommandIntentV1, SharedPlayClientV1, SharedPlayTransportV1 } from "./types.js";
import {
  isSharedCommandIntentV1,
  isSharedCommandStatusV1,
  isSharedPlayViewV1,
} from "./validation.js";

export function createSharedPlayClientV1(transport: SharedPlayTransportV1): SharedPlayClientV1 {
  return Object.freeze({
    async getView() {
      const value = await transport.send("shared.view.get", {});
      if (!isSharedPlayViewV1(value)) throw new Error("shared-view-invalid");
      return value;
    },
    async enqueueCommand(command: SharedCommandIntentV1) {
      if (!isSharedCommandIntentV1(command)) throw new Error("shared-command-invalid");
      const payload: CanonicalJsonObject = {
        command: {
          commandId: command.commandId,
          target: {
            aggregateKind: command.target.aggregateKind,
            aggregateId: command.target.aggregateId,
            schemaId: command.target.schemaId,
            schemaVersion: command.target.schemaVersion,
          },
          expectedStateVersion: command.expectedStateVersion,
          type: command.type,
          payload: command.payload,
          observationIds: command.observationIds,
        },
      };
      const value = await transport.send("shared.command.enqueue", payload);
      if (!isSharedCommandStatusV1(value) || value.commandId !== command.commandId) {
        throw new Error("shared-command-result-invalid");
      }
      return value;
    },
    onSyncChanged(listener: () => void) {
      return transport.subscribe("shared.sync.changed", listener);
    },
  });
}
