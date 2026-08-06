import type {
  CanonicalJsonObject,
  CanonicalJsonValue,
  LocalAggregateView,
  TransitionCandidate,
  TransitionResult,
} from "@plotpoint/protocol";

export interface LocalPreflightInvalidResult {
  readonly commandId: string;
  readonly disposition: "not-recorded";
  readonly terminal: "invalid";
  readonly phase: "preflight";
  readonly diagnosticCodes: readonly string[];
}

export type LocalCommandResult = TransitionResult | LocalPreflightInvalidResult;

export interface HostObservationReference extends CanonicalJsonObject {
  readonly observationId: string;
  readonly kind: string;
  readonly key: string;
  readonly value: CanonicalJsonValue;
}

export interface LocalCommandInput {
  readonly commandId: string;
  readonly payload: CanonicalJsonObject;
  readonly observations?: readonly HostObservationReference[];
}

export interface LocalCommandBinding {
  prepare(input: {
    readonly view: LocalAggregateView;
    readonly commandId: string;
    readonly payload: CanonicalJsonObject;
    readonly observations: readonly HostObservationReference[];
  }): TransitionCandidate | LocalPreflightInvalidResult;
}

export interface LocalCommandInvoker {
  execute(input: LocalCommandInput): Promise<LocalCommandResult>;
}

export interface LocalModelAdapter {
  getView(): Promise<LocalAggregateView>;
  onChanged(listener: () => void): () => void;
  readonly commands: Readonly<Record<string, LocalCommandInvoker>>;
}

function isPreflightInvalid(
  value: TransitionCandidate | LocalPreflightInvalidResult,
): value is LocalPreflightInvalidResult {
  return "disposition" in value && value.disposition === "not-recorded";
}

function validatePreparedCandidate(input: {
  readonly candidate: TransitionCandidate;
  readonly command: LocalCommandInput;
  readonly view: LocalAggregateView;
}): void {
  const observationIds = (input.command.observations ?? []).map(
    ({ observationId }) => observationId,
  );
  if (
    input.candidate.commandId !== input.command.commandId ||
    input.candidate.modelId !== input.view.modelId ||
    input.candidate.target.aggregateId !== input.view.aggregateId ||
    input.candidate.target.aggregateKind !== input.view.aggregateKind ||
    input.candidate.target.schemaId !== input.view.schemaId ||
    input.candidate.expectedStateVersion !== input.view.stateVersion ||
    JSON.stringify(input.candidate.observationIds) !== JSON.stringify(observationIds)
  ) {
    throw new Error("runtime-local-candidate-binding-mismatch");
  }
}

function committedView(
  current: LocalAggregateView,
  candidate: TransitionCandidate,
  result: TransitionResult,
): LocalAggregateView {
  if (candidate.terminal !== "accepted" || result.terminal !== "accepted") {
    return current;
  }
  return Object.freeze({
    ...current,
    stateVersion: result.resultingStateVersion,
    state: candidate.nextState ?? current.state,
    ...(candidate.nextProgression === undefined
      ? current.progression === undefined
        ? {}
        : { progression: current.progression }
      : { progression: candidate.nextProgression }),
  });
}

export function createLocalModelAdapter(input: {
  readonly initialView: LocalAggregateView;
  readonly bindings: Readonly<Record<string, LocalCommandBinding>>;
  commit(candidate: TransitionCandidate): Promise<TransitionResult>;
}): LocalModelAdapter {
  let view = Object.freeze({ ...input.initialView });
  const listeners = new Set<() => void>();
  const commands = Object.fromEntries(
    Object.entries(input.bindings).map(([commandId, binding]) => [
      commandId,
      Object.freeze({
        async execute(command: LocalCommandInput): Promise<LocalCommandResult> {
          const prepared = binding.prepare({
            view,
            commandId: command.commandId,
            payload: command.payload,
            observations: command.observations ?? [],
          });
          if (isPreflightInvalid(prepared)) {
            if (prepared.commandId !== command.commandId) {
              throw new Error("runtime-local-command-correlation-mismatch");
            }
            return prepared;
          }
          validatePreparedCandidate({ candidate: prepared, command, view });
          const result = await input.commit(prepared);
          if (result.commandId !== command.commandId) {
            throw new Error("runtime-local-command-correlation-mismatch");
          }
          if (result.terminal !== prepared.terminal) {
            throw new Error("runtime-local-command-terminal-mismatch");
          }
          const expectedResultingStateVersion =
            view.stateVersion + (result.terminal === "accepted" ? 1 : 0);
          if (result.resultingStateVersion !== expectedResultingStateVersion) {
            throw new Error("runtime-local-command-version-mismatch");
          }
          const next = committedView(view, prepared, result);
          if (next !== view) {
            view = next;
            // oxlint-disable-next-line unicorn/no-useless-spread -- listeners may unsubscribe while notified
            for (const listener of [...listeners]) listener();
          }
          return result;
        },
      } satisfies LocalCommandInvoker),
    ]),
  );

  return Object.freeze({
    async getView() {
      return view;
    },
    onChanged(listener: () => void) {
      if (typeof listener !== "function") throw new Error("runtime-local-listener-invalid");
      listeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
      };
    },
    commands: Object.freeze(commands),
  });
}
