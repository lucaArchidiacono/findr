import { z } from "zod";
import { BusEvent } from "./bus-event";

/**
 * Event Bus for pub/sub communication between components
 * Similar to OpenCode's Bus architecture
 */
export namespace Bus {
  type Subscription = (event: unknown) => void | Promise<void>;

  const subscriptions = new Map<string, Subscription[]>();

  /**
   * Publish an event to all subscribers
   */
  export async function publish<Definition extends BusEvent.Definition>(
    def: Definition,
    properties: z.infer<Definition["properties"]>,
  ): Promise<void> {
    const payload = {
      type: def.type,
      properties,
    };

    const pending: (void | Promise<void>)[] = [];

    // Notify specific subscribers
    const specific = subscriptions.get(def.type);
    if (specific) {
      for (const sub of specific) {
        pending.push(sub(payload));
      }
    }

    // Notify wildcard subscribers
    const wildcard = subscriptions.get("*");
    if (wildcard) {
      for (const sub of wildcard) {
        pending.push(sub(payload));
      }
    }

    await Promise.all(pending);
  }

  /**
   * Subscribe to a specific event type
   */
  export function subscribe<Definition extends BusEvent.Definition>(
    def: Definition,
    callback: (event: {
      type: Definition["type"];
      properties: z.infer<Definition["properties"]>;
    }) => void | Promise<void>,
  ): () => void {
    return raw(def.type, callback as Subscription);
  }

  /**
   * Subscribe to all events
   */
  export function subscribeAll(
    callback: (event: { type: string; properties: unknown }) => void | Promise<void>,
  ): () => void {
    return raw("*", callback as Subscription);
  }

  /**
   * Subscribe once and unsubscribe after first matching event
   */
  export function once<Definition extends BusEvent.Definition>(
    def: Definition,
    callback: (event: {
      type: Definition["type"];
      properties: z.infer<Definition["properties"]>;
    }) => "done" | undefined,
  ): () => void {
    const unsub = subscribe(def, (event) => {
      if (callback(event) === "done") {
        unsub();
      }
    });
    return unsub;
  }

  function raw(type: string, callback: Subscription): () => void {
    let subs = subscriptions.get(type);
    if (!subs) {
      subs = [];
      subscriptions.set(type, subs);
    }
    subs.push(callback);

    return () => {
      const match = subscriptions.get(type);
      if (!match) return;
      const index = match.indexOf(callback);
      if (index === -1) return;
      match.splice(index, 1);
    };
  }

  /**
   * Clear all subscriptions (useful for testing)
   */
  export function clear(): void {
    subscriptions.clear();
  }
}
