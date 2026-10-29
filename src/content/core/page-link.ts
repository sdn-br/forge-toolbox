/**
 * The content script's way to a module in the page: commands go out over window.postMessage to the own origin, events
 * come back as messages from this window itself. `parse` turns a message into an event, or null for any other.
 */
export function pageLink<Command, Event>(parse: (data: unknown) => Event | null) {
  return {
    post: (command: Command) => window.postMessage(command, location.origin),
    on: (listener: (event: Event) => void) =>
      window.addEventListener('message', (event: MessageEvent) => {
        if (event.source !== window) return;
        const parsed = parse(event.data);
        if (parsed) listener(parsed);
      }),
  };
}
