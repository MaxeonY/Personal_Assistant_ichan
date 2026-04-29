import { describe, expect, it } from 'vitest';
import { routePhysicalEventToDialogOpen } from './dialogRouter';
import type { DialogOpenSource, PetFullState } from '../components/Pet/types';

function makeState(overrides: Partial<PetFullState>): PetFullState {
  return {
    lifecycle: 'alive',
    major: 'idle',
    idleSub: 'awake',
    movement: {
      state: 'still',
      direction: null,
      target: null,
      requestId: null,
    },
    flags: { isHungry: false },
    ...overrides,
  };
}

describe('routePhysicalEventToDialogOpen', () => {
  const sources: DialogOpenSource[] = ['doubleClick', 'shortcut', 'morningRitual'];

  it('allows alive + idle when dialog is closed', () => {
    for (const source of sources) {
      const routed = routePhysicalEventToDialogOpen(
        makeState({ major: 'idle', idleSub: 'awake' }),
        () => false,
        source,
      );
      expect(routed.shouldDispatch).toBe(true);
      expect(routed.event).toEqual({ type: 'dialog.open', source });
    }
  });

  it('rejects when dialog is already open', () => {
    const routed = routePhysicalEventToDialogOpen(
      makeState({ major: 'idle', idleSub: 'awake' }),
      () => true,
      'doubleClick',
    );
    expect(routed).toEqual({ shouldDispatch: false });
  });

  it('rejects non-idle major states', () => {
    const majors: PetFullState['major'][] = ['talking', 'happy', 'eating', 'reminding'];
    for (const major of majors) {
      const routed = routePhysicalEventToDialogOpen(
        makeState({ major, idleSub: undefined }),
        () => false,
        'shortcut',
      );
      expect(routed).toEqual({ shouldDispatch: false });
    }
  });

  it('rejects non-alive lifecycle', () => {
    const lifecycles: PetFullState['lifecycle'][] = ['deep_sleep', 'waking_up', 'farewell'];
    for (const lifecycle of lifecycles) {
      const routed = routePhysicalEventToDialogOpen(
        makeState({ lifecycle }),
        () => false,
        'doubleClick',
      );
      expect(routed).toEqual({ shouldDispatch: false });
    }
  });
});
