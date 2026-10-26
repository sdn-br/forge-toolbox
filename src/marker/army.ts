// Reads the opponent from the game's army window. The class names are minified, so the window is found by its fields.
//
// debt: relies on undocumented internals of the game engine (`windowContainer`, an army window with `_attackButton`
// and `settings.battleType.defenderPlayerId`, seen 2026-10-26). Ceiling: a game update can rename them; then no
// opponent is found and the pvp box stays on all battles, as it did before. Upgrade: fix the lookup against the new
// engine when the pvp box stops picking the opponent.

interface EngineNode {
  __children?: EngineNode[];
  __visible?: unknown;
  windowContainer?: EngineNode;
  _attackButton?: unknown;
  settings?: { battleType?: { type?: unknown; defenderPlayerId?: unknown } };
}

/** the defender of the pvp battle the open army window prepares, or undefined when none shows */
export function armyTarget(stage: EngineNode | undefined): number | undefined {
  for (const child of stage?.__children ?? []) {
    for (const w of child?.windowContainer?.__children ?? []) {
      if (w?.__visible === false || !w._attackButton) continue;
      const battle = w.settings?.battleType;
      const id = battle?.defenderPlayerId;
      if (battle?.type === 'pvp' && Number.isSafeInteger(id) && (id as number) > 0) return id as number;
    }
  }
  return undefined;
}
