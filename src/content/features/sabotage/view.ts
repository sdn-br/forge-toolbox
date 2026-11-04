import { html, type TemplateResult } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { ref } from 'lit-html/directives/ref.js';
import { formatNumber, formatPercent, t } from '../../core/texts';
import type { ArmyValues } from '../../domain/assess-city';
import { battleDetailsView } from '../../ui/battle-details';
import { headerIcons, icons } from '../../ui/icons';
import { externalLink, guildTag } from '../../ui/links';
import { plunderCard } from '../../ui/plunder';
import { pvpMarks } from '../../ui/pvp-marks';
import { tabBar } from '../../ui/tabs';
import { rowsIn, rowWindow, windowedRows } from '../../ui/windowed-rows';
import type { PlunderItem, SabotageVm } from './view-model';

const armyCells = (army: ArmyValues | undefined) =>
  army
    ? html`<td class="num">${formatPercent(army.attack)}</td><td class="num">${formatPercent(army.defense)}</td>`
    : html`<td></td><td></td>`;

function armyTable(army: NonNullable<SabotageVm['army']>, repel: number, measured: SabotageVm['measured']) {
  const heads = html`<th class="num">${t('sabotage.attack')}</th><th class="num">${t('sabotage.defense')}</th>`;
  return html`
  <table>
    ${
      measured
        ? html`<tr><th></th><th class="num" colspan="2">${t('sabotage.calculated')}</th>
            <th class="num" colspan="2">${t('sabotage.measured', { when: measured.when })}</th></tr>`
        : ''
    }
    <tr><th></th>${heads}${measured ? heads : ''}</tr>
    <tr><td>${t('sabotage.attacker')}</td>${armyCells(army.attacker)}${measured ? armyCells(undefined) : ''}</tr>
    <tr><td>${t('sabotage.defender')}</td>${armyCells(army.defender)}${measured ? armyCells(measured.defender) : ''}</tr>
    <tr><td>${t('sabotage.plunderRepel')}</td><td class="num" colspan="2">${formatPercent(repel)}</td></tr>
  </table>
  ${measured ? html`<p class="muted">${t('sabotage.measuredHint')}</p>` : ''}`;
}

/** Points at plunderable buildings in the game. */
export interface PlunderMarks {
  /** whether the building carries the arrow set from its row */
  marked(building: number): boolean;
  /** sets the arrow on the building, or takes it away again */
  toggle(building: number): void;
}

/** Enter and space press a row like a button; the keys are not meant for the game. */
const pressKeys = (action: () => void) => (e: KeyboardEvent) => {
  e.stopPropagation();
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  action();
};

/** rows of the plunder list in view; the box is as high as its head and this many rows (Nutzer, 2026-11-03) */
export const VISIBLE_ROWS = 5;

/** loot lines a row shows: with more items the first two and "+n weitere", so name and lines fill the row height */
const LOOT_LINES = 3;

/** the loot lines of a row, nothing summed; the rest as a muted count */
const lootLines = (items: PlunderItem['items']) => {
  const shown = items.length > LOOT_LINES ? items.slice(0, LOOT_LINES - 1) : items;
  const rest = items.length - shown.length;
  return html`${shown.map((i) => html`<div>${formatNumber(i.amount)} ${i.label}</div>`)}${
    rest > 0 ? html`<div class="muted">${t('sabotage.moreLoot', { count: rest })}</div>` : ''
  }`;
};

/** the whole name and loot, one item per line, for the tooltip of the row's cells */
const lootTip = (p: PlunderItem) => [p.name, ...p.items.map((i) => `${formatNumber(i.amount)} ${i.label}`)].join('\n');

const plunderTable = (items: PlunderItem[], inView: PlunderItem[], marks?: PlunderMarks) => {
  // the image column stays while any building has an image, so the width does not jump when the window moves
  const images = items.some((p) => p.image);
  return html`<table class="plunder-table">${inView.map((p) => {
    const tip = lootTip(p);
    const loot = html`${
      images
        ? html`<td class="img" data-tip=${tip}><span class="frame">${
            p.image ? html`<img src=${p.image} alt="" loading="lazy" referrerpolicy="no-referrer" />` : ''
          }</span></td>`
        : ''
    }<td class="text" data-tip=${tip}><div class="plunder-name"><b>${p.name}</b></div>${lootLines(p.items)}</td>`;
    const muted = p.important ? '' : ' muted';
    if (!marks) return html`<tr class=${muted.trim()}>${loot}</tr>`;
    const marked = marks.marked(p.building);
    const toggle = () => marks.toggle(p.building);
    // the loot tooltip sits on the image and the text, the pin tooltip on the pin
    return html`<tr class=${`plunder-row${muted}${marked ? ' marked' : ''}`} role="button" tabindex="0"
      aria-pressed=${String(marked)} @click=${toggle} @keydown=${pressKeys(toggle)}>${loot}<td class="mark"
      data-tip=${t(marked ? 'sabotage.unmarkInGame' : 'sabotage.markInGame')}>${headerIcons.mapPin(marked)}</td></tr>`;
  })}</table>`;
};

function lastBattlePart({ when, result, details }: NonNullable<SabotageVm['lastBattle']>) {
  const line = t('sabotage.lastBattle', { when, result });
  if (!details) return html`<p>${line}</p>`;
  return html`<details><summary>${line}</summary>${battleDetailsView(details)}</details>`;
}

/** the two tabs of the box, Plündern first */
export const TABS = ['plunder', 'fight'] as const;
export type SabotageTab = (typeof TABS)[number];

/** What the box keeps between redraws: the chosen tab and whether the note card is shown. */
export interface SabotageUi {
  tab: SabotageTab;
  pickTab(tab: SabotageTab): void;
  /** the note of the visited player, the tooltip of the note icon; empty without one */
  noteText: string;
  noteOpen: boolean;
  toggleNote(): void;
  /** index of the first plunder row in view */
  plunderTop: number;
  /** moves the plunder list by rows, down for positive; the owner keeps the offset inside the list */
  scrollPlunder(rows: number): void;
  /** counts the visits; a new one, like another tab, starts the content area at the top */
  visit: number;
  /** gets the content area of the Plündern tab on every render, to measure its height */
  measure(area: Element | undefined): void;
  /** the height the Plündern tab had when last measured; the Kampf tab takes it, so the box keeps its size */
  fightHeight?: number;
}

const tabLabel = (key: SabotageTab, vm: SabotageVm) =>
  key === 'plunder'
    ? html`${icons.sack}${vm.plunderable.length ? html`<span class="count">${vm.plunderable.length}</span>` : ''}`
    : icons.pvp;

/** The note icon at the right end of the first line; faded without a note. The tooltip is the note. */
const noteButton = (ui: SabotageUi) => {
  const word = t(ui.noteOpen ? 'sabotage.noteHide' : 'sabotage.noteShow');
  const text = ui.noteText.trim();
  const tip = text.length > 300 ? `${text.slice(0, 300)}…` : text || t('sabotage.noteCreate');
  return html`<button class=${text ? 'note-icon' : 'note-icon empty'} aria-pressed=${String(ui.noteOpen)} aria-label=${word}
    data-tip=${tip} @click=${ui.toggleNote}>${icons.notes}</button>`;
};

/** the rows of "Jetzt plünderbar": a window of VISIBLE_ROWS, wheel and buttons move it; a shorter list has neither */
const plunderList = (vm: SabotageVm, ui: SabotageUi, marks?: PlunderMarks) => {
  const window = rowWindow(ui.plunderTop, vm.plunderable.length, VISIBLE_ROWS);
  const table = plunderTable(vm.plunderable, rowsIn(vm.plunderable, window), marks);
  if (vm.plunderable.length <= VISIBLE_ROWS) return table;
  return windowedRows({ cls: 'plunder-win', table, window, scroll: ui.scrollPlunder });
};

const plunderTab = (vm: SabotageVm, ui: SabotageUi, marks?: PlunderMarks) => html`
  ${
    vm.plundered?.last
      ? html`<p class="muted">${vm.plundered.totals}</p>`
      : html`<p class="muted">${t('sabotage.neverPlundered')}</p>`
  }
  <div class="plunder-list">${
    vm.plunderable.length === 0
      ? html`<p class="muted">${t('sabotage.nothingPlunderable')}</p>`
      : plunderList(vm, ui, marks)
  }</div>
  ${vm.incomplete ? html`<p class="warn">${t('sabotage.incomplete')}</p>` : ''}`;

const fightTab = (vm: SabotageVm) => {
  const last = vm.plundered?.last;
  if (!vm.attackedMe && !vm.army && !vm.lastBattle && !last)
    return html`<p class="muted">${t('sabotage.nothingToShow')}</p>`;
  return html`
    ${
      vm.attackedMe
        ? html`<p>${t('sabotage.attackedMe', { when: vm.attackedMe.when, result: vm.attackedMe.what })}
          <br />${vm.attackedMe.totals}</p>`
        : ''
    }
    ${vm.army ? armyTable(vm.army, vm.plunderRepel, vm.measured) : ''}
    ${vm.lastBattle ? lastBattlePart(vm.lastBattle) : ''}
    ${last ? plunderCard(last, t('sabotage.lastPlunder', { when: last.when })) : ''}`;
};

/**
 * `note` is the note card of the visited player, shown below the head while `ui.noteOpen`; `marks` points at
 * plunderable buildings in the game. The head and the tab bar sit outside any scrolling area; only the content of the
 * Kampf tab scrolls, when it is taller than the box may be. The plunder list is a window of rows instead.
 */
export function sabotageView(
  vm: SabotageVm | undefined,
  ui: SabotageUi,
  note?: TemplateResult,
  marks?: PlunderMarks,
  /** sets the PvP marks of the visited player or takes them away */
  playerMarks?: { plunder(value: boolean): void; noAttack(value: boolean): void },
): TemplateResult {
  if (!vm) return html`<p class="muted">${t('sabotage.noVisit')}</p>`;
  return html`
    <div class="visit-top">
      <p class="visit-name"><span><b>${externalLink(vm.player.owner, vm.player.ownerUrl)}</b>${
        vm.player.ownerGuild ? html` ${guildTag(vm.player.ownerGuild)}` : ''
      }${
        vm.player.friendInvited
          ? html` <span class="rel-icons" data-tip=${t('friend.invited')} aria-label=${t('friend.invited')}>${headerIcons.friendInvited}</span>`
          : ''
      }${playerMarks ? html` ${pvpMarks(vm.player, playerMarks.plunder, playerMarks.noAttack)}` : ''}
        <br /><span class="muted">${t('sabotage.era')}: ${vm.player.era}</span></span>${noteButton(ui)}</p>
      <p class="visit-attack">${vm.attack.kind === 'plunderable' ? html`<b>${vm.attack.text}</b>` : vm.attack.text}</p>
      ${ui.noteOpen && note ? note : ''}
      ${tabBar(
        TABS,
        ui.tab,
        (key) => tabLabel(key, vm),
        ui.pickTab,
        (key) => t(`sabotage.tab.${key}`),
      )}
    </div>
${keyed(
  `${ui.visit}-${ui.tab}`,
  ui.tab === 'plunder'
    ? html`<div class="visit-content" ${ref(ui.measure)}>${plunderTab(vm, ui, marks)}</div>`
    : html`<div class="visit-content" style=${ui.fightHeight ? `height:${ui.fightHeight}px` : ''}>${fightTab(vm)}</div>`,
)}`;
}
