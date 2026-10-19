import type { PlayerId } from '../../../shared/ids';
import type { Battle, Player } from '../../../shared/model';
import { formatWhen, t } from '../../core/texts';
import type { ArmyValues } from '../../domain/assess-city';
import { measuredArmy } from '../../domain/measured-army';

export const PAGE_SIZE = 20;

/** A picked player wins over the search text. */
export interface PvpFilter {
  text: string;
  opponent?: PlayerId;
}

export interface PvpRow {
  battleId: number;
  opponent: PlayerId;
  name: string;
  when: string;
  result: string;
  battle: string;
  attacker: ArmyValues;
  defender: ArmyValues;
}

export interface PvpVm {
  rows: PvpRow[];
  search: string;
  /** name of the picked player */
  picked?: string;
  page: number;
  pages: number;
  empty?: 'none' | 'noMatch';
}

/** The opponents a filter asks for; undefined means all, an empty list means none matches. */
export function opponentsFor(filter: PvpFilter, players: Player[]): PlayerId[] | undefined {
  if (filter.opponent !== undefined) return [filter.opponent];
  const text = filter.text.trim().toLowerCase();
  if (!text) return undefined;
  return players.filter((p) => p.name.toLowerCase().includes(text)).map((p) => p.id);
}

export const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));

// a surrender before the first round has ended reports no rounds
function battleKind(b: Battle): string {
  if (b.auto) return t('pvp.auto');
  if (b.rounds === 0) return t('pvp.manual');
  return b.rounds === 1 ? t('pvp.round') : t('pvp.rounds', { count: b.rounds });
}

export function pvpViewModel(input: {
  battles: Battle[];
  total: number;
  page: number;
  filter: PvpFilter;
  name: (id: PlayerId) => string | undefined;
  now: number;
}): PvpVm {
  const { battles, total, page, filter, name, now } = input;
  const nameOf = (id: PlayerId) => name(id) || String(id);
  const filtered = filter.opponent !== undefined || filter.text.trim() !== '';
  return {
    rows: battles.map((b) => {
      const army = measuredArmy(b);
      return {
        battleId: b.battleId,
        opponent: b.opponent,
        name: nameOf(b.opponent),
        when: formatWhen(b.at, now),
        result: t(`pvp.${b.result}`),
        battle: battleKind(b),
        attacker: army.attacker,
        defender: army.defender,
      };
    }),
    search: filter.text,
    picked: filter.opponent === undefined ? undefined : nameOf(filter.opponent),
    page,
    pages: pageCount(total),
    empty: total > 0 ? undefined : filtered ? 'noMatch' : 'none',
  };
}
