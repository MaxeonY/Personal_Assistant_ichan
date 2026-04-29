import { petBehaviorConfig } from '../config/petBehaviorConfig';

export interface TimerBackend {
  setTimeout(handler: () => void, timeoutMs: number): number;
  clearTimeout(handle: number): void;
}

export interface StateMachineTimerConfig {
  idleTimeoutMs: number;
  drowsyToNapMs: number;
  roamingMinMs: number;
  roamingMaxMs: number;
}

export const DEFAULT_STATE_MACHINE_TIMER_CONFIG: Readonly<StateMachineTimerConfig> = Object.freeze({
  idleTimeoutMs: petBehaviorConfig.stateTimers.idleTimeoutMs,
  drowsyToNapMs: petBehaviorConfig.stateTimers.drowsyToNapMs,
  roamingMinMs: petBehaviorConfig.stateTimers.roamingMinMs,
  roamingMaxMs: petBehaviorConfig.stateTimers.roamingMaxMs,
});

function randomBetween(min: number, max: number, random: () => number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.floor(random() * (max - min));
}

export class StateMachineTimers {
  private readonly backend: TimerBackend;
  private readonly config: StateMachineTimerConfig;
  private readonly random: () => number;

  private idleTimeoutHandle: number | null = null;
  private drowsyToNapHandle: number | null = null;
  private roamingTickHandle: number | null = null;

  constructor(
    config: StateMachineTimerConfig,
    backend: TimerBackend,
    random: () => number,
  ) {
    this.config = config;
    this.backend = backend;
    this.random = random;
  }

  public getConfig(): Readonly<StateMachineTimerConfig> {
    return this.config;
  }

  public restartIdleTimeout(callback: () => void): void {
    this.clearIdleTimeout();
    this.idleTimeoutHandle = this.backend.setTimeout(callback, this.config.idleTimeoutMs);
  }

  public clearIdleTimeout(): void {
    if (this.idleTimeoutHandle !== null) {
      this.backend.clearTimeout(this.idleTimeoutHandle);
      this.idleTimeoutHandle = null;
    }
  }

  public restartDrowsyToNap(callback: () => void): void {
    this.clearDrowsyToNap();
    this.drowsyToNapHandle = this.backend.setTimeout(callback, this.config.drowsyToNapMs);
  }

  public clearDrowsyToNap(): void {
    if (this.drowsyToNapHandle !== null) {
      this.backend.clearTimeout(this.drowsyToNapHandle);
      this.drowsyToNapHandle = null;
    }
  }

  public restartRoamingTick(callback: () => void): void {
    this.clearRoamingTick();
    const delay = randomBetween(
      this.config.roamingMinMs,
      this.config.roamingMaxMs,
      this.random,
    );
    this.roamingTickHandle = this.backend.setTimeout(callback, delay);
  }

  public clearRoamingTick(): void {
    if (this.roamingTickHandle !== null) {
      this.backend.clearTimeout(this.roamingTickHandle);
      this.roamingTickHandle = null;
    }
  }

  public clearAll(): void {
    this.clearIdleTimeout();
    this.clearDrowsyToNap();
    this.clearRoamingTick();
  }
}
