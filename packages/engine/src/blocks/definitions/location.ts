import { z } from 'zod';
import {
  BlockUpdateError,
  defineBlockBehavior,
  type BlockTraversalFacts,
  type InteractiveBlockBehavior,
} from '../contracts.js';

type LocationBlockConfig = {
  hint?: string | undefined;
  radiusMeters: number;
  target:
    | {
        kind: 'coordinates';
        lat: number;
        lng: number;
      }
    | {
        kind: 'place';
        placeId: string;
      };
  ui: {
    variant: 'compass' | 'hint' | 'map';
  };
};

type LocationBlockAction = {
  type: 'submit';
};

type LocationCheck = {
  distanceMeters?: number | undefined;
  playerLocation:
    | {
        lat: number;
        lng: number;
      }
    | null;
  submitted: LocationBlockAction;
  submittedAt?: string | undefined;
  withinRadius: boolean;
};

type LocationBlockState = {
  checks: LocationCheck[];
  checksCount: number;
  lastSubmittedAt?: string | undefined;
  unlocked: boolean;
};

const locationConfigSchema: z.ZodType<LocationBlockConfig> = z
  .object({
    hint: z.string().min(1).optional(),
    radiusMeters: z.number().positive(),
    target: z.union([
      z
        .object({
          kind: z.literal('coordinates'),
          lat: z.number(),
          lng: z.number(),
        })
        .strict(),
      z
        .object({
          kind: z.literal('place'),
          placeId: z.string().min(1),
        })
        .strict(),
    ]),
    ui: z
      .object({
        variant: z.enum(['map', 'compass', 'hint']),
      })
      .strict(),
  })
  .strict();

const locationActionSchema: z.ZodType<LocationBlockAction> = z
  .object({
    type: z.literal('submit'),
  })
  .strict();

const locationTargetSchema = z.union([
  z
    .object({
      kind: z.literal('coordinates'),
      lat: z.number(),
      lng: z.number(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('place'),
      placeId: z.string().min(1),
    })
    .strict(),
]);

const locationCheckSchema: z.ZodType<LocationCheck> = z
  .object({
    distanceMeters: z.number().nonnegative().optional(),
    playerLocation: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .strict()
      .nullable(),
    submitted: locationActionSchema,
    submittedAt: z.string().min(1).optional(),
    withinRadius: z.boolean(),
  })
  .strict();

const locationStateSchema: z.ZodType<LocationBlockState> = z
  .object({
    checks: z.array(locationCheckSchema),
    checksCount: z.number().int().nonnegative(),
    lastSubmittedAt: z.string().min(1).optional(),
    unlocked: z.boolean(),
  })
  .strict();

const earthRadiusMeters = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const calculateDistanceMeters = (
  origin: { lat: number; lng: number },
  target: { lat: number; lng: number },
): number => {
  const latitudeDelta = toRadians(target.lat - origin.lat);
  const longitudeDelta = toRadians(target.lng - origin.lng);
  const originLatitude = toRadians(origin.lat);
  const targetLatitude = toRadians(target.lat);

  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(originLatitude) *
      Math.cos(targetLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
};

export const locationBlockBehavior: InteractiveBlockBehavior<
  LocationBlockConfig,
  LocationBlockState,
  LocationBlockAction
> = defineBlockBehavior({
  configSchema: locationConfigSchema,
  initialState: (): LocationBlockState => ({
    checks: [],
    checksCount: 0,
    unlocked: false,
  }),
  interactive: true,
  isActionable: (state) => !state.unlocked,
  stateSchema: locationStateSchema,
  onAction: (state, action, context, config) => {
    if (config.target.kind === 'place') {
      throw new BlockUpdateError(
        'unsupported_location_target',
        'Location blocks with target kind "place" are not supported in runtime execution.',
        {
          targetKind: config.target.kind,
          targetPlaceId: config.target.placeId,
        },
      );
    }

    const submittedAt = context.nowIso;
    const playerLocation = context.playerLocation ?? null;
    const distanceMeters =
      playerLocation === null
        ? undefined
        : calculateDistanceMeters(playerLocation, {
            lat: config.target.lat,
            lng: config.target.lng,
          });
    const withinRadius =
      distanceMeters !== undefined && distanceMeters <= config.radiusMeters;

    const check: LocationCheck = submittedAt === undefined
      ? {
          distanceMeters,
          playerLocation,
          submitted: action,
          withinRadius,
        }
      : {
          distanceMeters,
          playerLocation,
          submitted: action,
          submittedAt,
          withinRadius,
        };

    return {
      checks: [...state.checks, check],
      checksCount: state.checksCount + 1,
      lastSubmittedAt: submittedAt,
      unlocked: state.unlocked || withinRadius,
    };
  },
  actionSchema: locationActionSchema,
});

export const locationBlockTraversalFacts: BlockTraversalFacts<
  LocationBlockConfig,
  LocationBlockState
> = {
  checksCount: {
    derive: ({ state }) => state.checksCount,
    kind: 'number',
  },
  unlocked: {
    derive: ({ state }) => state.unlocked,
    kind: 'boolean',
  },
};
