import type { DomainEvent } from "../domain/events.ts";

export interface EventPublisher {
  publish(events: readonly DomainEvent[]): Promise<void>;
}
