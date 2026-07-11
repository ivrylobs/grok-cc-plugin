import type { DomainEvent } from "../domain/events.ts";
import type { EventPublisher } from "../ports/event-publisher.ts";

export class InMemoryEventPublisher implements EventPublisher {
  readonly published: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.published.push(...events);
  }

  ofType<T extends DomainEvent["type"]>(
    type: T,
  ): Extract<DomainEvent, { type: T }>[] {
    return this.published.filter(
      (e): e is Extract<DomainEvent, { type: T }> => e.type === type,
    );
  }

  clear(): void {
    this.published.length = 0;
  }
}
