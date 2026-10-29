// The shell opens the box of a feature for another feature, or for the core (the settings button of a box).
// A command has exactly one receiver, so it goes through here instead of the bus: a box nobody registered shows
// as a type error, and at run time as a logged error instead of an event that nobody hears.
import { logError } from './log';

/**
 * The boxes another feature may open, by the id of the feature that owns the box, with the arguments of opening.
 * Each owner adds its entry next to its feature, so the ids stay where the features are:
 * `declare module '../../core/shell' { interface OpenableBoxes { gbPowerLevel: [] } }`
 */
// biome-ignore lint/suspicious/noEmptyInterface: the owning features add their entries by declaration merging
export interface OpenableBoxes {}

type Opener<A> = (...args: A extends unknown[] ? A : never) => void;

export function createShell<B extends object = OpenableBoxes>() {
  const openers = new Map<keyof B, Opener<never>>();
  return {
    /** the owner tells how to open its box; a second receiver for the same box is a mistake */
    registerOpen<K extends keyof B>(id: K, open: Opener<B[K]>): void {
      if (openers.has(id)) throw new Error(`the box of ${String(id)} is registered twice`);
      openers.set(id, open as Opener<never>);
    },
    open<K extends keyof B>(id: K, ...args: B[K] extends unknown[] ? B[K] : never): void {
      const open = openers.get(id) as Opener<B[K]> | undefined;
      if (!open) {
        logError(`no box registered to open for ${String(id)}`);
        return;
      }
      open(...args);
    },
  };
}

export type Shell = ReturnType<typeof createShell<OpenableBoxes>>;
