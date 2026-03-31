export const conditionRegistry = {
  'array-includes': true,
  'array-length': true,
  'field-compare': true,
  'field-equals': true,
  'time-elapsed': true,
  'within-radius': true,
} as const;

export type KnownConditionName = keyof typeof conditionRegistry;

export const hasConditionName = (conditionName: string): conditionName is KnownConditionName =>
  Object.hasOwn(conditionRegistry, conditionName);
