import { logError } from './log';

type Handler<P> = (payload: P) => void;

export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    for (const handler of this.handlers.get(type) ?? []) {
      // one faulty listener must not stop the others
      try {
        (handler as Handler<E[K]>)(payload);
      } catch (error) {
        logError(`listener for ${String(type)} failed`, error);
      }
    }
  }
}
