import { describe, expect, it, vi } from "vitest";
import { PetStateMachine } from "./StateMachine";
import { MockAnimationPlayer } from "./StateMachine.test-helpers";
import type { TimerBackend } from "./timers";

function createTimerBackend(): TimerBackend {
  return {
    setTimeout: () => -1,
    clearTimeout: () => {},
  };
}

function createMachine(onExitRequest?: () => void) {
  const machine = new PetStateMachine({
    random: () => 0.25,
    timerBackend: createTimerBackend(),
  });
  const player = new MockAnimationPlayer();
  machine.init(player, { onExitRequest });
  machine.start({ isNewDay: false, lastExitClean: true });
  return { machine, player };
}

describe("PetStateMachine farewell", () => {
  it("ignores incoming events while lifecycle is farewell", () => {
    const { machine, player } = createMachine();
    machine.dispatch({ type: "user.exit" });
    expect(machine.getState().lifecycle).toBe("farewell");

    const playCountBefore = player.operations.filter((op) => op.type === "play").length;
    machine.dispatch({ type: "idle.timeout" });
    machine.dispatch({ type: "user.pat" });
    machine.dispatch({ type: "dialog.open", source: "shortcut" });

    expect(machine.getState().lifecycle).toBe("farewell");
    const playCountAfter = player.operations.filter((op) => op.type === "play").length;
    expect(playCountAfter).toBe(playCountBefore);
  });

  it("calls onExitRequest exactly once after farewell onComplete", () => {
    const onExitRequest = vi.fn();
    const { machine, player } = createMachine(onExitRequest);

    machine.dispatch({ type: "user.exit" });
    expect(onExitRequest).not.toHaveBeenCalled();

    player.completeCurrent();
    expect(machine.getState().lifecycle).toBe("deep_sleep");
    expect(onExitRequest).toHaveBeenCalledTimes(1);
  });
});

