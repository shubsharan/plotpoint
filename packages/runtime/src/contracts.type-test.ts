import type { Aggregate, Command, HandlerDecision, JsonObject, JsonValue } from "./index.js";

const validValue: JsonValue = { nested: [null, true, 1, "value"] };
void validValue;

// @ts-expect-error functions are not canonical values
const invalidValue: JsonValue = () => undefined;
void invalidValue;

type State = JsonObject & { readonly score: number };
type Payload = JsonObject & { readonly amount: number };
type Outcome = JsonObject & { readonly result: string };

declare const aggregate: Aggregate<State>;
declare const command: Command<Payload>;

aggregate.state.score satisfies number;
command.payload.amount satisfies number;

// @ts-expect-error aggregate state is readonly
aggregate.state.score = 2;

const accepted: HandlerDecision<State, Outcome> = {
  kind: "accepted",
  nextState: { score: 1 },
  outcome: { result: "ok" },
  domainEvents: [],
  effectIntents: [],
  progressionIntents: [],
};
void accepted;

const rejected: HandlerDecision<State, Outcome> = {
  kind: "rejected",
  outcome: { result: "no" },
  // @ts-expect-error rejected decisions cannot contain accepted fields
  nextState: { score: 0 },
};
void rejected;
