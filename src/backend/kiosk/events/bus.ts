import { EventEmitter } from "node:events";

export class TypedEventBus<M extends Record<string, unknown>> extends EventEmitter {
  override on<K extends keyof M & string>(event: K, listener: (payload: M[K]) => void): this {
    return super.on(event, listener);
  }

  override once<K extends keyof M & string>(event: K, listener: (payload: M[K]) => void): this {
    return super.once(event, listener);
  }

  override off<K extends keyof M & string>(event: K, listener: (payload: M[K]) => void): this {
    return super.off(event, listener);
  }

  override emit<K extends keyof M & string>(event: K, payload: M[K]): boolean {
    const listeners = this.rawListeners(event);
    for (const listener of listeners) {
      try {
        (listener as (payload: M[K]) => void)(payload);
      } catch (err) {
        console.error(`[bus] Listener error on event "${event}":`, err);
      }
    }
    return listeners.length > 0;
  }
}
