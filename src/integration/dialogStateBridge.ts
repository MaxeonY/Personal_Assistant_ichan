import type { PetFullState, Unsubscribe } from '../components/Pet/types';

interface DialogSyncStateMachine {
  getState(): Readonly<PetFullState>;
  subscribe(listener: (state: Readonly<PetFullState>) => void): Unsubscribe;
}

/**
 * One-way close fallback:
 * only reacts when state exits talking while dialog UI is still open.
 */
export function watchTalkingExitForDialogSync(
  machine: DialogSyncStateMachine,
  shouldBridgeCloseDialog: () => boolean,
  triggerDialogUiClose: () => void,
): Unsubscribe {
  let prevMajor = machine.getState().major;

  return machine.subscribe((nextState) => {
    if (
      prevMajor === 'talking' &&
      nextState.major !== 'talking' &&
      shouldBridgeCloseDialog()
    ) {
      console.error(
        '[dialogStateBridge] state/UI mismatch: talking→%s but dialog still open, triggering UI close',
        nextState.major,
      );
      triggerDialogUiClose();
    }

    prevMajor = nextState.major;
  });
}
