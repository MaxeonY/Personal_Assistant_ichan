import type {
  FacingDirection,
  MovementRuntime,
  PetFullState,
} from '../components/Pet/types';

export function createStillMovement(): MovementRuntime {
  return {
    state: 'still',
    direction: null,
    target: null,
    requestId: null,
  };
}

export function createInitialPetState(): PetFullState {
  return {
    lifecycle: 'deep_sleep',
    major: 'idle',
    idleSub: 'awake',
    movement: createStillMovement(),
    flags: {
      isHungry: false,
    },
  };
}

export function cloneState(state: Readonly<PetFullState>): PetFullState {
  return {
    lifecycle: state.lifecycle,
    major: state.major,
    idleSub: state.idleSub,
    movement: {
      state: state.movement.state,
      direction: state.movement.direction,
      target: state.movement.target ? { ...state.movement.target } : null,
      requestId: state.movement.requestId,
    },
    flags: {
      isHungry: state.flags.isHungry,
    },
  };
}

export function isIdleAwake(state: Readonly<PetFullState>): boolean {
  return state.lifecycle === 'alive' && state.major === 'idle' && state.idleSub === 'awake';
}

export function isIdleDrowsy(state: Readonly<PetFullState>): boolean {
  return state.lifecycle === 'alive' && state.major === 'idle' && state.idleSub === 'drowsy';
}

export function isIdleNapping(state: Readonly<PetFullState>): boolean {
  return state.lifecycle === 'alive' && state.major === 'idle' && state.idleSub === 'napping';
}

export function isTalking(state: Readonly<PetFullState>): boolean {
  return state.lifecycle === 'alive' && state.major === 'talking';
}

export function isEating(state: Readonly<PetFullState>): boolean {
  return state.lifecycle === 'alive' && state.major === 'eating';
}

export function isReminding(state: Readonly<PetFullState>): boolean {
  return state.lifecycle === 'alive' && state.major === 'reminding';
}

export function canShowHungryOverlay(state: Readonly<PetFullState>): boolean {
  if (!state.flags.isHungry) {
    return false;
  }

  if (state.lifecycle !== 'alive') {
    return false;
  }

  return state.major !== 'eating';
}

export function resolveFallbackFacingDirection(targetX: number): FacingDirection {
  return targetX < 0 ? 'left' : 'right';
}
