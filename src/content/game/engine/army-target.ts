// Names the opponent of the army window before a pvp battle. The game traffic does not (see army.opened), so this asks
// the page module, which reads it from the game engine. Without an answer nothing more happens: whoever listens to
// army.opened works as before, and army.target only adds to it.
import { ARMY_TAG, type ArmyCommand, type ArmyEvent, parseArmyEvent } from '../../../shared/army-protocol';
import { playerId } from '../../../shared/ids';
import type { ToolboxBus } from '../../core/events';
import { pageLink } from '../../core/page-link';

/** The way to the page module; tests bring their own. */
export interface ArmyLink {
  post(command: ArmyCommand): void;
  onTarget(listener: (seq: number, playerId: number) => void): void;
  onClosed(listener: (seq: number) => void): void;
}

const link = pageLink<ArmyCommand, ArmyEvent>(parseArmyEvent);

export const windowArmyLink: ArmyLink = {
  post: link.post,
  onTarget: (listener) =>
    link.on((event) => {
      if (event.type === 'target') listener(event.seq, event.playerId);
    }),
  onClosed: (listener) =>
    link.on((event) => {
      if (event.type === 'closed') listener(event.seq);
    }),
};

export function watchArmyTarget(bus: ToolboxBus, link: ArmyLink): void {
  let seq = 0;
  /** the ask still open, 0 for none; only the first answer to the latest army window counts */
  let open = 0;
  /** the ask whose window showed its opponent and has not closed yet, 0 for none */
  let shown = 0;
  link.onTarget((answered, id) => {
    if (open === 0 || answered !== open) return;
    open = 0;
    shown = answered;
    bus.emit('army.target', { opponent: playerId(id) });
  });
  link.onClosed((closed) => {
    if (shown === 0 || closed !== shown) return;
    shown = 0;
    bus.emit('army.closed', {});
  });
  bus.on('army.opened', ({ battleType }) => {
    if (battleType !== 'pvp') return;
    open = ++seq;
    link.post({ tag: ARMY_TAG, from: 'content', type: 'target', seq });
  });
}
