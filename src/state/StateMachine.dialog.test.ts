import { describe, expect, it, vi } from 'vitest';
import { PetStateMachine } from './StateMachine';
import { MockAnimationPlayer } from './StateMachine.test-helpers';
import type { TimerBackend } from './timers';

function createTimerBackend(): TimerBackend {
  return {
    setTimeout: () => -1,
    clearTimeout: () => {},
  };
}

function createRunningMachine() {
  const machine = new PetStateMachine({
    random: () => 0.25,
    timerBackend: createTimerBackend(),
  });
  const player = new MockAnimationPlayer();
  machine.init(player);
  machine.start({ isNewDay: false, lastExitClean: true });
  return { machine, player };
}

describe('PetStateMachine dialog events', () => {
  it('opens talking from idle.awake via dialog.open', () => {
    const { machine } = createRunningMachine();

    machine.dispatch({ type: 'dialog.open', source: 'doubleClick' });

    const state = machine.getState();
    expect(state.major).toBe('talking');
    expect(state.movement.state).toBe('still');
  });

  it('opens talking from idle.drowsy after drowsy exit completion', () => {
    const { machine, player } = createRunningMachine();
    machine.dispatch({ type: 'idle.timeout' });
    machine.dispatch({ type: 'dialog.open', source: 'doubleClick' });

    expect(machine.getState().major).toBe('idle');
    expect(machine.getState().idleSub).toBe('drowsy');

    player.completeCurrent();
    expect(machine.getState().major).toBe('talking');
  });

  it('opens talking from idle.napping after wake.from_nap completion', () => {
    const { machine, player } = createRunningMachine();
    machine.dispatch({ type: 'idle.timeout' });
    player.completeCurrent();
    machine.dispatch({ type: 'timer.drowsyToNap' });
    machine.dispatch({ type: 'dialog.open', source: 'shortcut' });

    expect(machine.getState().major).toBe('idle');
    expect(machine.getState().idleSub).toBe('napping');

    player.completeCurrent();
    expect(machine.getState().major).toBe('talking');
  });

  it('closes talking to idle.awake via dialog.close', () => {
    const { machine } = createRunningMachine();
    machine.dispatch({ type: 'dialog.open', source: 'doubleClick' });

    machine.dispatch({ type: 'dialog.close', reason: 'user' });

    const state = machine.getState();
    expect(state.major).toBe('idle');
    expect(state.idleSub).toBe('awake');
  });

  it('ignores user.doubleClick as notification-only', () => {
    const { machine } = createRunningMachine();
    machine.dispatch({ type: 'user.doubleClick' });

    const state = machine.getState();
    expect(state.major).toBe('idle');
    expect(state.idleSub).toBe('awake');
  });

  it('warns for invalid dialog.close state', () => {
    const { machine } = createRunningMachine();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      machine.dispatch({ type: 'dialog.close', reason: 'user' });
      expect(warnSpy).toHaveBeenCalled();
      expect(String(warnSpy.mock.calls[0]?.[0] ?? '')).toContain('dialog.close ignored');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('clears pending dialog open when feed interrupts drowsy exit', () => {
    const { machine } = createRunningMachine();
    machine.dispatch({ type: 'idle.timeout' });
    machine.dispatch({ type: 'dialog.open', source: 'doubleClick' });

    expect((machine as any).pendingDialogOpen).not.toBeNull();

    machine.dispatch({ type: 'user.feed', csv: { name: 'dev-feed.csv' } as File });

    expect((machine as any).pendingDialogOpen).toBeNull();
    expect(machine.getState().major).toBe('eating');
  });
});
