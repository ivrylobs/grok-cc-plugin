/** Real clock, and a controllable clock for tests. */
import type { Clock } from "../ports/index.ts";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Test double: time only moves when you tell it to. */
export class MutableClock implements Clock {
  private current: Date;
  constructor(start: Date) {
    this.current = start;
  }
  now(): Date {
    return this.current;
  }
  set(next: Date): void {
    this.current = next;
  }
  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
