import type { SpriteSheetDefinition } from './types';
import type { SheetKey } from './sequences';

export type SpriteSheetKey = SheetKey | 'hungry_overlay';

export interface SpriteSheetRuntimeRecord {
  definition: SpriteSheetDefinition;
  image: HTMLImageElement;
  url: string;
}

export interface PreloadAllSheetsOptions {
  assetRoot?: string;
}

const DEFAULT_ASSET_ROOT = 'assets';

const SHEET_DEFINITIONS: Record<SpriteSheetKey, SpriteSheetDefinition> = {
  awake: {
    key: 'awake',
    basePath: 'idle/awake',
    image: 'awake.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 13,
    frames: {
      idle_awake_blink_01: 0,
      idle_awake_blink_02: 1,
      idle_awake_float_01: 2,
      idle_awake_float_02: 3,
      idle_awake_float_03: 4,
      idle_awake_float_04: 5,
      idle_awake_float_05: 6,
      idle_awake_float_06: 7,
      idle_awake_float_07: 8,
      idle_awake_float_08: 9,
      idle_awake_float_09: 10,
      idle_awake_float_10: 11,
      idle_awake_float_11: 12,
    },
  },
  drowsy: {
    key: 'drowsy',
    basePath: 'idle/drowsy',
    image: 'drowsy.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 12,
    frames: {
      idle_drowsy_end_01: 0,
      idle_drowsy_fade_01: 1,
      idle_drowsy_fade_02: 2,
      idle_drowsy_heavy_01: 3,
      idle_drowsy_settle_01: 4,
      idle_drowsy_settle_02: 5,
      idle_drowsy_start_01: 6,
      idle_drowsy_yawn_01: 7,
      idle_drowsy_yawn_02: 8,
      idle_drowsy_yawn_03: 9,
      idle_drowsy_yawn_04: 10,
      idle_drowsy_yawn_05: 11,
    },
  },
  napping: {
    key: 'napping',
    basePath: 'sleep/napping',
    image: 'napping.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 7,
    frames: {
      sleep_napping_base_01: 0,
      sleep_napping_base_02: 1,
      sleep_napping_fall_01: 2,
      sleep_napping_rise_01: 3,
      sleep_napping_rise_02: 4,
      sleep_napping_top_01: 5,
      sleep_napping_top_02: 6,
    },
  },
  talk: {
    key: 'talk',
    basePath: 'talk',
    image: 'talk.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 5,
    frames: {
      talk_half_01: 0,
      talk_half_02: 1,
      talk_idle_01: 2,
      talk_open_01: 3,
      talk_open_02: 4,
    },
  },
  eat: {
    key: 'eat',
    basePath: 'eat',
    image: 'eat.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 8,
    frames: {
      eat_bite_01: 0,
      eat_bite_02: 1,
      eat_chew_01: 2,
      eat_chew_02: 3,
      eat_chew_03: 4,
      eat_chew_04: 5,
      eat_end_01: 6,
      eat_start_01: 7,
    },
  },
  happy: {
    key: 'happy',
    basePath: 'happy',
    image: 'happy.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 8,
    frames: {
      happy_end_01: 0,
      happy_peak_01: 1,
      happy_peak_02: 2,
      happy_peak_03: 3,
      happy_relax_01: 4,
      happy_relax_02: 5,
      happy_rise_01: 6,
      happy_start_01: 7,
    },
  },
  reminding: {
    key: 'reminding',
    basePath: 'reminding',
    image: 'reminding.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 7,
    frames: {
      reminding_base_01: 0,
      reminding_peak_01: 1,
      reminding_peak_02: 2,
      reminding_relax_01: 3,
      reminding_relax_02: 4,
      reminding_wave_01: 5,
      reminding_wave_02: 6,
    },
  },
  day_start: {
    key: 'day_start',
    basePath: 'wake/day_start',
    image: 'day_start.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 8,
    frames: {
      wake_day_start_awake_01: 0,
      wake_day_start_drowsy_01: 1,
      wake_day_start_drowsy_02: 2,
      wake_day_start_end_01: 3,
      wake_day_start_rise_01: 4,
      wake_day_start_settle_01: 5,
      wake_day_start_sleep_01: 6,
      wake_day_start_sleep_02: 7,
    },
  },
  from_nap: {
    key: 'from_nap',
    basePath: 'wake/from_nap',
    image: 'from_nap.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 6,
    frames: {
      wake_from_nap_awake_01: 0,
      wake_from_nap_end_01: 1,
      wake_from_nap_rise_01: 2,
      wake_from_nap_rise_02: 3,
      wake_from_nap_settle_01: 4,
      wake_from_nap_start_01: 5,
    },
  },
  goodbye: {
    key: 'goodbye',
    basePath: 'goodbye',
    image: 'goodbye.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 7,
    frames: {
      goodbye_end_01: 0,
      goodbye_fade_01: 1,
      goodbye_start_01: 2,
      goodbye_wave_01: 3,
      goodbye_wave_02: 4,
      goodbye_wave_03: 5,
      goodbye_wave_04: 6,
    },
  },
  roaming: {
    key: 'roaming',
    basePath: 'walk/roaming',
    image: 'roaming.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 10,
    frames: {
      walk_roaming_left_01: 0,
      walk_roaming_left_02: 1,
      walk_roaming_left_03: 2,
      walk_roaming_left_04: 3,
      walk_roaming_left_05: 4,
      walk_roaming_right_01: 5,
      walk_roaming_right_02: 6,
      walk_roaming_right_03: 7,
      walk_roaming_right_04: 8,
      walk_roaming_right_05: 9,
    },
  },
  targeted: {
    key: 'targeted',
    basePath: 'walk/targeted',
    image: 'targeted.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 6,
    frames: {
      walk_targeted_left_01: 0,
      walk_targeted_left_02: 1,
      walk_targeted_lft_03: 2,
      walk_targeted_right_01: 3,
      walk_targeted_right_02: 4,
      walk_targeted_right_03: 5,
    },
  },
  hungry_overlay: {
    key: 'overlay',
    basePath: 'hungry/overlay',
    image: 'overlay.png',
    frameWidth: 840,
    frameHeight: 520,
    frameCount: 6,
    frames: {
      hungry_overlay_base_01: 0,
      hungry_overlay_base_02: 1,
      hungry_overlay_recover_01: 2,
      hungry_overlay_shake_01: 3,
      hungry_overlay_shake_02: 4,
      hungry_overlay_weak_01: 5,
    },
  },
};

const pinnedImages = new Map<string, HTMLImageElement>();
const pendingLoads = new Map<string, Promise<HTMLImageElement>>();

function normalizeSegment(segment: string): string {
  return segment.replace(/^\/+|\/+$/g, '');
}

function joinUrl(...segments: string[]): string {
  const normalized = segments
    .filter(Boolean)
    .map((segment, index) => {
      if (index === 0) {
        return segment.replace(/\/+$/g, '');
      }
      return normalizeSegment(segment);
    })
    .filter(Boolean);

  return normalized.join('/');
}

function getAssetRoot(assetRoot?: string): string {
  return assetRoot && assetRoot.trim().length > 0 ? assetRoot : DEFAULT_ASSET_ROOT;
}

function resolveSheetUrl(definition: SpriteSheetDefinition, assetRoot?: string): string {
  return joinUrl(getAssetRoot(assetRoot), definition.basePath, definition.image);
}

function assertImageConstructor(): void {
  if (typeof Image === 'undefined') {
    throw new Error('AnimationPlayer preloadAll() requires a browser-like environment with global Image.');
  }
}

async function loadSheetImage(url: string): Promise<HTMLImageElement> {
  const existingImage = pinnedImages.get(url);
  if (existingImage) {
    return existingImage;
  }

  const existingPromise = pendingLoads.get(url);
  if (existingPromise) {
    return existingPromise;
  }

  assertImageConstructor();

  const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      pinnedImages.set(url, image);
      pendingLoads.delete(url);
      resolve(image);
    };
    image.onerror = () => {
      pendingLoads.delete(url);
      reject(new Error(`Failed to load spritesheet image: ${url}`));
    };
    image.src = url;
  });

  pendingLoads.set(url, loadPromise);
  return loadPromise;
}

export function getSpriteSheetDefinition(sheetKey: SpriteSheetKey): SpriteSheetDefinition {
  return SHEET_DEFINITIONS[sheetKey];
}

export function getAllSpriteSheetDefinitions(): readonly SpriteSheetDefinition[] {
  return Object.values(SHEET_DEFINITIONS);
}

export function getPinnedSheetUrl(sheetKey: SpriteSheetKey, assetRoot?: string): string {
  return resolveSheetUrl(getSpriteSheetDefinition(sheetKey), assetRoot);
}

export function getPinnedSheet(sheetKey: SpriteSheetKey, assetRoot?: string): HTMLImageElement | undefined {
  return pinnedImages.get(getPinnedSheetUrl(sheetKey, assetRoot));
}

export async function preloadAllSheets(
  options: PreloadAllSheetsOptions = {},
): Promise<readonly SpriteSheetRuntimeRecord[]> {
  const assetRoot = getAssetRoot(options.assetRoot);
  const definitions = getAllSpriteSheetDefinitions();

  const records = await Promise.all(
    definitions.map(async (definition) => {
      const url = resolveSheetUrl(definition, assetRoot);
      const image = await loadSheetImage(url);
      return { definition, image, url } satisfies SpriteSheetRuntimeRecord;
    }),
  );

  return records;
}
