import type { CanonicalJsonObject } from "../release/types.js";
import type { SharedCommandIntent, SharedPlayClient, SharedPlayTransport } from "./types.js";
import { isSharedCommandIntent, isSharedCommandStatus, isSharedPlayView } from "./validation.js";

export function createSharedPlayClient(transport: SharedPlayTransport): SharedPlayClient {
  return Object.freeze({
    async getView() {
      const value = await transport.send("shared.view.get", {});
      if (!isSharedPlayView(value)) throw new Error("shared-view-invalid");
      return value;
    },
    async enqueueCommand(command: SharedCommandIntent) {
      if (!isSharedCommandIntent(command)) throw new Error("shared-command-invalid");
      const payload: CanonicalJsonObject = {
        command: {
          commandId: command.commandId,
          target: {
            aggregateKind: command.target.aggregateKind,
            aggregateId: command.target.aggregateId,
            schemaId: command.target.schemaId,
          },
          expectedStateVersion: command.expectedStateVersion,
          type: command.type,
          payload: command.payload,
          observationIds: command.observationIds,
        },
      };
      const value = await transport.send("shared.command.enqueue", payload);
      if (!isSharedCommandStatus(value) || value.commandId !== command.commandId) {
        throw new Error("shared-command-result-invalid");
      }
      return value;
    },
    onSyncChanged(listener: () => void) {
      return transport.subscribe("shared.sync.changed", listener);
    },
  });
}
