/** Injected clock — domain never calls Date.now(). */
export interface Clock {
  now(): Date;
}
