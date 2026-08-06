import type {
  Aggregate,
  Command,
  ExecutionResult,
  HandlerDecision,
  JsonObject,
  JsonValue,
  RuntimeSchema,
} from "@plotpoint/runtime";

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

const schema: RuntimeSchema<State> = {
  id: "score.state",
  schemaDigest: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
  validate(value) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "score" in value &&
      typeof value.score === "number"
    ) {
      return { valid: true, value: { score: value.score } };
    }
    return { valid: false, diagnostics: [] };
  },
};
void schema;

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

type OrderedExecutionResult = ExecutionResult<State, Outcome, Payload, "team">;
type RecordedExecution = Extract<OrderedExecutionResult, { readonly kind: "recorded" }>;

type StateParameterIsFirst = Expect<Equal<RecordedExecution["aggregate"]["state"], State>>;
type OutcomeParameterIsSecond = Expect<
  Equal<NonNullable<RecordedExecution["record"]["outcome"]>, Outcome>
>;
type PayloadParameterIsThird = Expect<
  Equal<RecordedExecution["record"]["command"]["payload"], Payload>
>;
type KindParameterIsFourth = Expect<Equal<RecordedExecution["aggregate"]["aggregateKind"], "team">>;

declare const stateParameterIsFirst: StateParameterIsFirst;
declare const outcomeParameterIsSecond: OutcomeParameterIsSecond;
declare const payloadParameterIsThird: PayloadParameterIsThird;
declare const kindParameterIsFourth: KindParameterIsFourth;
void stateParameterIsFirst;
void outcomeParameterIsSecond;
void payloadParameterIsThird;
void kindParameterIsFourth;
