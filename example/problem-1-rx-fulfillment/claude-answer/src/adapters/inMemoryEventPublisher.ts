/**
 * In-memory EventPublisher that records everything published, so tests can
 * assert that `prescription.dispensed` (etc.) was emitted exactly once.
 * In production this is a transactional-outbox writer feeding Kafka/SNS.
 */
import type { DomainEvent } from "../domain/events.ts";
import type { EventPublisher } from "../ports/index.ts";

export class InMemoryEventPublisher implements EventPublisher {
  readonly published: DomainEvent[] = [];

  async publish(events: DomainEvent[]): Promise<void> {
    for (const e of events) this.published.push(e);
  }

  ofType<T extends DomainEvent["type"]>(type: T): DomainEvent[] {
    return this.published.filter((e) => e.type === type);
  }
}
