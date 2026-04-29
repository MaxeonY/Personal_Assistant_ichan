import { describe, expect, it, vi } from 'vitest';
import { watchTalkingExitForDialogSync } from './dialogStateBridge';
import type { PetFullState, Unsubscribe } from '../components/Pet/types';

class FakeMachine {
  private state: PetFullState;
  private listeners = new Set<(state: PetFullState) => void>();

  constructor(initial: PetFullState) {
    this.state = initial;
  }

  getState(): Readonly<PetFullState> {
    return this.state;
  }

  subscribe(listener: (state: PetFullState) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  push(next: PetFullState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }
}

function makeState(major: PetFullState['major']): PetFullState {
  return {
    lifecycle: 'alive',
    major,
    idleSub: major === 'idle' ? 'awake' : undefined,
    movement: {
      state: 'still',
      direction: null,
      target: null,
      requestId: null,
    },
    flags: { isHungry: false },
  };
}

describe('watchTalkingExitForDialogSync', () => {
  it('triggers UI close when talking exits and guard allows it', () => {
    const machine = new FakeMachine(makeState('talking'));
    const trigger = vi.fn();
    const shouldBridgeCloseDialog = vi.fn(() => true);

    const unsubscribe = watchTalkingExitForDialogSync(
      machine,
      shouldBridgeCloseDialog,
      trigger,
    );

    machine.push(makeState('eating'));

    expect(shouldBridgeCloseDialog).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not trigger when guard blocks bridge close', () => {
    const machine = new FakeMachine(makeState('talking'));
    const trigger = vi.fn();

    watchTalkingExitForDialogSync(machine, () => false, trigger);
    machine.push(makeState('idle'));

    expect(trigger).not.toHaveBeenCalled();
  });

  it('does not handle opening path (idle -> talking)', () => {
    const machine = new FakeMachine(makeState('idle'));
    const trigger = vi.fn();

    watchTalkingExitForDialogSync(machine, () => true, trigger);
    machine.push(makeState('talking'));

    expect(trigger).not.toHaveBeenCalled();
  });

  it('stops receiving updates after unsubscribe', () => {
    const machine = new FakeMachine(makeState('talking'));
    const trigger = vi.fn();

    const unsubscribe = watchTalkingExitForDialogSync(machine, () => true, trigger);
    unsubscribe();
    machine.push(makeState('idle'));

    expect(trigger).not.toHaveBeenCalled();
  });
});
