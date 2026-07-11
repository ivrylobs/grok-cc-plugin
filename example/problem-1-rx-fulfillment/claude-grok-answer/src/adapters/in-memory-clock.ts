import type { Clock } from "../ports/clock.ts";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Mutable clock for tests — domain stays pure via injection. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(current: Date) {
    this.current = current;
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  set(d: Date): void {
    this.current = new Date(d.getTime());
  }
}
