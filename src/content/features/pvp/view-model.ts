import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { Battle, IncomingAttack, IncomingTotals, Player, Plunder, PlunderTotals } from '../../../shared/model';
import {
  formatIncoming,
  formatIncomingTotals,
  formatPlunderTotals,
  formatResources,
  formatWhen,
  t,
} from '../../core/texts';
import type { ArmyValues } from '../../domain/assess-city';
import { measuredArmy } from '../../domain/measured-army';
import { plainText } from '../../ui/markdown';

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
  /** the opponent's note as plain text, empty when there is none */
  note: string;
}

export type PvpTab = 'battles' | 'plunders' | 'incoming';

export interface PlunderRow {
  opponent: PlayerId;
  name: string;
  when: string;
  building: string;
  loot: string;
  doubleLoot: boolean;
  note: string;
}

/** an attack on the own city */
export interface IncomingRow {
  attacker: PlayerId;
  name: string;
  when: string;
  /** kind and outcome, e.g. "Kampf: durchbrochen" */
  what: string;
  note: string;
}

export interface PvpVm {
  tab: PvpTab;
  /** the rows of the battles tab */
  rows: PvpRow[];
  /** the rows of the plunders tab */
  plunders: PlunderRow[];
  /** count and Forge points of the plunders the filter matches */
  plunderTotals: string;
  /** the rows of the tab of attacks on the own city */
  incoming: IncomingRow[];
  /** battles, held ones and plunders of the attacks on the own city the filter matches */
  incomingTotals: string;
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

function battleKind(b: Battle): string {
  if (b.auto) return t('pvp.auto');
  return b.rounds === 1 ? t('pvp.round') : t('pvp.rounds', { count: b.rounds });
}

export function pvpViewModel(input: {
  tab: PvpTab;
  battles: Battle[];
  plunders: Plunder[];
  /** number of rows of the shown tab over all pages */
  total: number;
  plunderTotals: PlunderTotals;
  incoming: IncomingAttack[];
  incomingTotals: IncomingTotals;
  page: number;
  filter: PvpFilter;
  name: (id: PlayerId) => string | undefined;
  building: (id: BuildingDefId) => string | undefined;
  resourceName: (id: string) => string | undefined;
  /** the Markdown note of a player, if any */
  note: (id: PlayerId) => string | undefined;
  now: number;
}): PvpVm {
  const { tab, battles, plunders, total, page, filter, name, building, resourceName, now } = input;
  const nameOf = (id: PlayerId) => name(id) || String(id);
  const noteOf = (id: PlayerId) => plainText(input.note(id) ?? '');
  const filtered = filter.opponent !== undefined || filter.text.trim() !== '';
  return {
    tab,
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
        note: noteOf(b.opponent),
      };
    }),
    plunders: plunders.map((p) => ({
      opponent: p.opponent,
      name: nameOf(p.opponent),
      when: formatWhen(p.at, now),
      building: p.cityEntityId === undefined ? '–' : (building(p.cityEntityId) ?? p.cityEntityId),
      loot: p.outcome === 'repelled' ? t('plunder.repelled') : formatResources(p.resources, { resourceName }),
      doubleLoot: p.doubleLoot,
      note: noteOf(p.opponent),
    })),
    plunderTotals: formatPlunderTotals(input.plunderTotals),
    incoming: input.incoming.map((a) => ({
      attacker: a.attacker,
      name: nameOf(a.attacker),
      when: formatWhen(a.at, now),
      what: formatIncoming(a, building),
      note: noteOf(a.attacker),
    })),
    incomingTotals: formatIncomingTotals(input.incomingTotals),
    search: filter.text,
    picked: filter.opponent === undefined ? undefined : nameOf(filter.opponent),
    page,
    pages: pageCount(total),
    empty: total > 0 ? undefined : filtered ? 'noMatch' : 'none',
  };
}
