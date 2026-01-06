import { z } from "zod";
import type { ZodType } from "zod";

/**
 * BusEvent namespace for defining type-safe events
 * Similar to OpenCode's event system
 */
export namespace BusEvent {
  export type Definition<T extends string = string, P extends ZodType = ZodType> = {
    type: T;
    properties: P;
  };

  const registry = new Map<string, Definition>();

  /**
   * Define a new event type with a Zod schema for its properties
   */
  export function define<Type extends string, Properties extends ZodType>(
    type: Type,
    properties: Properties,
  ): Definition<Type, Properties> {
    const result = {
      type,
      properties,
    };
    registry.set(type, result);
    return result;
  }

  /**
   * Get all registered event definitions
   */
  export function all(): Map<string, Definition> {
    return registry;
  }
}
