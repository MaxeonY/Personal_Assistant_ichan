import type {
  DialogOpenSource,
  PetEvent,
  PetFullState,
} from '../components/Pet/types';

/**
 * Router layer gate for physical open inputs.
 * Only allow dialog.open when state is alive + idle and dialog UI is closed.
 */
export function routePhysicalEventToDialogOpen(
  state: Readonly<PetFullState>,
  isDialogOpen: () => boolean,
  source: DialogOpenSource,
): { shouldDispatch: boolean; event?: PetEvent } {
  const canOpen =
    state.lifecycle === 'alive' &&
    state.major === 'idle' &&
    !isDialogOpen();

  if (!canOpen) {
    return { shouldDispatch: false };
  }

  return {
    shouldDispatch: true,
    event: { type: 'dialog.open', source },
  };
}
