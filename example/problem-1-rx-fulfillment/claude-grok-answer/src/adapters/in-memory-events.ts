import type { DomainEvent } from "../domain/events.ts";
import type { EventPublisher } from "../ports/event-publisher.ts";

export class InMemoryEventBus implements EventPublisher {
  readonly published: DomainEvent[] = [];

  async publish(events: readonly DomainEvent[]): Promise<void> {
    this.published.push(...events);
  }

  ofType<T extends DomainEvent["type"]>(
    type: T,
  ): Extract<DomainEvent, { type: T }>[] {
    return this.published.filter((e) => e.type === type) as Extract<
      DomainEvent,
      { type: T }
    >[];
  }

  clear(): void {
    this.published.length = 0;
  }
}
