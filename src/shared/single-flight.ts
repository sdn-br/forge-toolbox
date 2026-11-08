/** `fn` with calls for a key that is still running sharing its result, so the work runs once at a time per key */
export function singleFlight<K, V, A extends unknown[] = []>(fn: (key: K, ...rest: A) => Promise<V>) {
  const running = new Map<K, Promise<V>>();
  return (key: K, ...rest: A): Promise<V> => {
    let pending = running.get(key);
    if (!pending) {
      pending = fn(key, ...rest).finally(() => running.delete(key));
      running.set(key, pending);
    }
    return pending;
  };
}
