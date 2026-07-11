import type { DomainEvent } from "../domain/events.ts";

export interface EventPublisher {
  publish(events: ReadonlyArray<DomainEvent>): Promise<void>;
}
