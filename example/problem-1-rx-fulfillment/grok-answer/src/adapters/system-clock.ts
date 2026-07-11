import type { Clock } from "../ports/clock.ts";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Deterministic clock for tests. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(current: Date) {
    this.current = new Date(current.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(date: Date): void {
    this.current = new Date(date.getTime());
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
