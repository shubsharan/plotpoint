export type KnownConditionName =
  | "array-includes"
  | "array-length"
  | "field-compare"
  | "field-equals"
  | "time-elapsed"
  | "within-radius";

export const conditionRegistry: Record<KnownConditionName, true> = {
  "array-includes": true,
  "array-length": true,
  "field-compare": true,
  "field-equals": true,
  "time-elapsed": true,
  "within-radius": true,
};

export const hasConditionName = (
  conditionName: string,
): conditionName is KnownConditionName => Object.hasOwn(conditionRegistry, conditionName);
