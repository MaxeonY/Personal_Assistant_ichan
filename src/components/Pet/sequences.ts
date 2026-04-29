import type {
  Intent,
  PetState,
  PlaybackVariant,
  SupportedIntent,
} from './types';
import { petBehaviorConfig } from '../../config/petBehaviorConfig';

export type SheetKey =
  | 'awake'
  | 'drowsy'
  | 'napping'
  | 'talk'
  | 'eat'
  | 'happy'
  | 'reminding'
  | 'day_start'
  | 'from_nap'
  | 'goodbye'
  | 'roaming'
  | 'targeted';

export type SequenceRuntimeMode = 'simple' | 'awakeLoop';

export interface SequenceDefinition<S extends PetState = PetState> {
  readonly state: S;
  readonly intent: SupportedIntent<S>;
  readonly variant: PlaybackVariant;
  readonly sheetKey: SheetKey;
  readonly runtimeMode: SequenceRuntimeMode;
  readonly frames: readonly string[];
  readonly defaultFrameDurationMs: number;
  readonly loop: boolean;
  readonly mirrorX?: boolean;
  readonly blinkFrames?: readonly string[];
  readonly blinkFrameDurationMs?: number;
  readonly blinkMinIntervalMs?: number;
  readonly blinkMaxIntervalMs?: number;
}

const IDLE_AWAKE_FLOAT_FRAMES = [
  'idle_awake_float_01',
  'idle_awake_float_02',
  'idle_awake_float_03',
  'idle_awake_float_04',
  'idle_awake_float_05',
  'idle_awake_float_06',
  'idle_awake_float_07',
  'idle_awake_float_08',
  'idle_awake_float_09',
  'idle_awake_float_10',
  'idle_awake_float_11',
] as const;

const IDLE_AWAKE_PINGPONG = [
  ...IDLE_AWAKE_FLOAT_FRAMES,
  ...IDLE_AWAKE_FLOAT_FRAMES.slice(1, -1).reverse(),
] as const;

const SEQUENCES = [
  {
    state: 'idle.awake',
    intent: 'loop',
    variant: 'default',
    sheetKey: 'awake',
    runtimeMode: 'awakeLoop',
    frames: IDLE_AWAKE_PINGPONG,
    defaultFrameDurationMs: petBehaviorConfig.playback.idleAwakeMs,
    loop: true,
    blinkFrames: ['idle_awake_blink_01', 'idle_awake_blink_02', 'idle_awake_blink_01'],
    blinkFrameDurationMs: 70,
    blinkMinIntervalMs: 3000,
    blinkMaxIntervalMs: 8000,
  },
  {
    state: 'idle.drowsy',
    intent: 'enter',
    variant: 'default',
    sheetKey: 'drowsy',
    runtimeMode: 'simple',
    frames: [
      'idle_drowsy_start_01',
      'idle_drowsy_heavy_01',
      'idle_drowsy_yawn_01',
      'idle_drowsy_yawn_02',
      'idle_drowsy_yawn_03',
      'idle_drowsy_yawn_04',
      'idle_drowsy_yawn_05',
      'idle_drowsy_settle_01',
      'idle_drowsy_settle_02',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.idleDrowsyEnterMs,
    loop: false,
  },
  {
    state: 'idle.drowsy',
    intent: 'loop',
    variant: 'default',
    sheetKey: 'drowsy',
    runtimeMode: 'simple',
    frames: ['idle_drowsy_end_01'],
    defaultFrameDurationMs: petBehaviorConfig.playback.idleDrowsyLoopMs,
    loop: true,
  },
  {
    state: 'idle.drowsy',
    intent: 'exit',
    variant: 'default',
    sheetKey: 'drowsy',
    runtimeMode: 'simple',
    frames: [
      'idle_drowsy_end_01',
      'idle_drowsy_fade_01',
      'idle_drowsy_heavy_01',
      'idle_drowsy_start_01',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.idleDrowsyExitMs,
    loop: false,
  },
  {
    state: 'idle.napping',
    intent: 'enter',
    variant: 'default',
    sheetKey: 'napping',
    runtimeMode: 'simple',
    frames: ['sleep_napping_fall_01'],
    defaultFrameDurationMs: petBehaviorConfig.playback.idleNappingEnterMs,
    loop: false,
  },
  {
    state: 'idle.napping',
    intent: 'loop',
    variant: 'default',
    sheetKey: 'napping',
    runtimeMode: 'simple',
    frames: [
      'sleep_napping_base_01',
      'sleep_napping_base_02',
      'sleep_napping_rise_01',
      'sleep_napping_rise_02',
      'sleep_napping_top_01',
      'sleep_napping_top_02',
      'sleep_napping_top_01',
      'sleep_napping_rise_02',
      'sleep_napping_rise_01',
      'sleep_napping_base_02',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.idleNappingLoopMs,
    loop: true,
  },
  {
    state: 'talking',
    intent: 'loop',
    variant: 'default',
    sheetKey: 'talk',
    runtimeMode: 'simple',
    frames: ['talk_idle_01', 'talk_half_01', 'talk_open_01', 'talk_open_02', 'talk_half_02'],
    defaultFrameDurationMs: petBehaviorConfig.playback.talkingMs,
    loop: true,
  },
  {
    state: 'eating',
    intent: 'oneshot',
    variant: 'default',
    sheetKey: 'eat',
    runtimeMode: 'simple',
    frames: [
      'eat_start_01',
      'eat_bite_01',
      'eat_bite_02',
      'eat_chew_01',
      'eat_chew_02',
      'eat_chew_03',
      'eat_chew_04',
      'eat_end_01',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.eatingMs,
    loop: false,
  },
  {
    state: 'happy',
    intent: 'oneshot',
    variant: 'default',
    sheetKey: 'happy',
    runtimeMode: 'simple',
    frames: [
      'happy_start_01',
      'happy_rise_01',
      'happy_peak_01',
      'happy_peak_02',
      'happy_peak_03',
      'happy_relax_01',
      'happy_relax_02',
      'happy_end_01',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.happyMs,
    loop: false,
  },
  {
    state: 'reminding',
    intent: 'loop',
    variant: 'default',
    sheetKey: 'reminding',
    runtimeMode: 'simple',
    frames: [
      'reminding_base_01',
      'reminding_wave_01',
      'reminding_peak_01',
      'reminding_wave_02',
      'reminding_peak_02',
      'reminding_relax_01',
      'reminding_relax_02',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.remindingMs,
    loop: true,
  },
  {
    state: 'wake.day_start',
    intent: 'oneshot',
    variant: 'default',
    sheetKey: 'day_start',
    runtimeMode: 'simple',
    frames: [
      'wake_day_start_sleep_01',
      'wake_day_start_sleep_02',
      'wake_day_start_drowsy_01',
      'wake_day_start_drowsy_02',
      'wake_day_start_rise_01',
      'wake_day_start_settle_01',
      'wake_day_start_awake_01',
      'wake_day_start_end_01',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.wakeDayStartMs,
    loop: false,
  },
  {
    state: 'wake.from_nap',
    intent: 'oneshot',
    variant: 'default',
    sheetKey: 'from_nap',
    runtimeMode: 'simple',
    frames: [
      'wake_from_nap_start_01',
      'wake_from_nap_rise_01',
      'wake_from_nap_rise_02',
      'wake_from_nap_settle_01',
      'wake_from_nap_awake_01',
      'wake_from_nap_end_01',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.wakeFromNapMs,
    loop: false,
  },
  {
    state: 'farewell',
    intent: 'oneshot',
    variant: 'default',
    sheetKey: 'goodbye',
    runtimeMode: 'simple',
    frames: [
      'goodbye_start_01',
      'goodbye_wave_01',
      'goodbye_wave_02',
      'goodbye_wave_03',
      'goodbye_wave_04',
      'goodbye_fade_01',
      'goodbye_end_01',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.farewellMs,
    loop: false,
  },
  {
    state: 'walk.roaming',
    intent: 'loop',
    variant: 'left',
    sheetKey: 'roaming',
    runtimeMode: 'simple',
    frames: [
      'walk_roaming_left_01',
      'walk_roaming_left_02',
      'walk_roaming_left_03',
      'walk_roaming_left_04',
      'walk_roaming_left_05',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.walkRoamingMs,
    loop: true,
  },
  {
    state: 'walk.roaming',
    intent: 'loop',
    variant: 'right',
    sheetKey: 'roaming',
    runtimeMode: 'simple',
    frames: [
      'walk_roaming_right_01',
      'walk_roaming_right_02',
      'walk_roaming_right_03',
      'walk_roaming_right_04',
      'walk_roaming_right_05',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.walkRoamingMs,
    loop: true,
  },
  {
    state: 'walk.targeted',
    intent: 'loop',
    variant: 'right',
    sheetKey: 'targeted',
    runtimeMode: 'simple',
    frames: [
      'walk_targeted_right_01',
      'walk_targeted_right_02',
      'walk_targeted_right_03',
      'walk_targeted_right_02',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.walkTargetedMs,
    loop: true,
  },
  {
    state: 'walk.targeted',
    intent: 'loop',
    variant: 'left',
    sheetKey: 'targeted',
    runtimeMode: 'simple',
    frames: [
      'walk_targeted_right_01',
      'walk_targeted_right_02',
      'walk_targeted_right_03',
      'walk_targeted_right_02',
    ],
    defaultFrameDurationMs: petBehaviorConfig.playback.walkTargetedMs,
    loop: true,
    mirrorX: true,
  },
] as const satisfies readonly SequenceDefinition[];

export type ResolvedSequenceDefinition = SequenceDefinition;

function buildSequenceKey(state: PetState, intent: Intent, variant: PlaybackVariant): string {
  return `${state}::${intent}::${variant}`;
}

const sequenceMap = new Map<string, ResolvedSequenceDefinition>(
  SEQUENCES.map((definition) => [
    buildSequenceKey(definition.state, definition.intent, definition.variant),
    definition,
  ]),
);

export function resolveSequenceDefinition<S extends PetState>(
  state: S,
  intent: SupportedIntent<S>,
  variant: PlaybackVariant = 'default',
): ResolvedSequenceDefinition {
  const key = buildSequenceKey(state, intent as Intent, variant);
  const definition = sequenceMap.get(key);
  if (definition) {
    return definition;
  }

  const fallbackKey = buildSequenceKey(state, intent as Intent, 'default');
  const fallback = sequenceMap.get(fallbackKey);
  if (fallback) {
    return fallback;
  }

  throw new Error(`Unsupported sequence combination: ${key}`);
}

export const ALL_SEQUENCE_DEFINITIONS = SEQUENCES;
