import type {
  AnimationPlayer,
  AnimationPlayerSnapshot,
  PlayParams,
} from '../components/Pet/AnimationPlayer';
import type {
  CSSEffect,
  Intent,
  OverlayAnimation,
  OverlayIntent,
  PetState,
  PlayToken,
  PlaybackVariant,
} from '../components/Pet/types';

export type MockPlayerOperation =
  | { type: 'play'; token: PlayToken; state: PetState; intent: Intent; variant: PlaybackVariant; raw: PlayParams }
  | { type: 'interrupt'; token: PlayToken }
  | { type: 'attach'; effect: CSSEffect }
  | { type: 'detach'; effect: CSSEffect }
  | { type: 'playOverlay'; overlay: OverlayAnimation; intent: OverlayIntent }
  | { type: 'stopOverlay'; overlay: OverlayAnimation }
  | { type: 'clearEffects' }
  | { type: 'preloadAll' };

interface PendingCompletion {
  token: PlayToken;
  onComplete?: (token: PlayToken) => void;
}

export class MockAnimationPlayer implements AnimationPlayer {
  public readonly operations: MockPlayerOperation[] = [];

  private issuedToken = 0;
  private currentToken = 0;
  private isCurrentlyPlaying = false;
  private currentState: PetState | null = null;
  private currentIntent: Intent | null = null;
  private currentVariant: PlaybackVariant | null = null;
  private currentFrameName: string | null = null;
  private readonly attachedEffects = new Set<CSSEffect>();
  private pendingCompletion: PendingCompletion | null = null;

  public async preloadAll(): Promise<void> {
    this.operations.push({ type: 'preloadAll' });
  }

  public play<S extends PetState>(params: PlayParams<S>): PlayToken {
    const token = ++this.issuedToken;
    const variant = (params.variant ?? 'default') as PlaybackVariant;
    this.currentToken = token;
    this.isCurrentlyPlaying = true;
    this.currentState = params.state;
    this.currentIntent = params.intent;
    this.currentVariant = variant;
    this.pendingCompletion = {
      token,
      onComplete: params.onComplete,
    };

    this.operations.push({
      type: 'play',
      token,
      state: params.state,
      intent: params.intent,
      variant,
      raw: params,
    });

    return token;
  }

  public interrupt(token: PlayToken): void {
    this.operations.push({ type: 'interrupt', token });
    if (token === this.currentToken) {
      this.isCurrentlyPlaying = false;
      this.pendingCompletion = null;
    }
  }

  public attachCSSEffect(effect: CSSEffect): void {
    this.attachedEffects.add(effect);
    this.operations.push({ type: 'attach', effect });
  }

  public detachCSSEffect(effect: CSSEffect): void {
    this.attachedEffects.delete(effect);
    this.operations.push({ type: 'detach', effect });
  }

  public playOverlay(overlay: OverlayAnimation, intent: OverlayIntent): void {
    this.operations.push({ type: 'playOverlay', overlay, intent });
  }

  public stopOverlay(overlay: OverlayAnimation): void {
    this.operations.push({ type: 'stopOverlay', overlay });
  }

  public clearCSSEffects(): void {
    this.attachedEffects.clear();
    this.operations.push({ type: 'clearEffects' });
  }

  public getCurrentToken(): PlayToken {
    return this.currentToken;
  }

  public isPlaying(token?: PlayToken): boolean {
    if (token == null) {
      return this.isCurrentlyPlaying;
    }
    return this.isCurrentlyPlaying && token === this.currentToken;
  }

  public getSnapshot(): Readonly<AnimationPlayerSnapshot> {
    return Object.freeze({
      currentToken: this.currentToken,
      isPlaying: this.isCurrentlyPlaying,
      currentState: this.currentState,
      currentIntent: this.currentIntent,
      currentVariant: this.currentVariant,
      currentFrameName: this.currentFrameName,
      attachedEffects: Object.freeze([...this.attachedEffects]),
    });
  }

  public completeCurrent(): void {
    const pending = this.pendingCompletion;
    if (!pending) {
      return;
    }
    this.pendingCompletion = null;
    this.isCurrentlyPlaying = false;
    pending.onComplete?.(pending.token);
  }

  public resetOperations(): void {
    this.operations.length = 0;
  }
}

export async function waitMs(timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}
