import { html, type TemplateResult } from 'lit-html';
import { formatNumber, formatPercent, t } from '../../core/texts';
import type { ArmyValues } from '../../domain/assess-city';
import { battleDetailsView } from '../../ui/battle-details';
import { headerIcons, icons } from '../../ui/icons';
import { externalLink, guildTag } from '../../ui/links';
import { plunderCard } from '../../ui/plunder';
import { pvpMarks } from '../../ui/pvp-marks';
import { tabBar } from '../../ui/tabs';
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

/** the building's image in its own column, kept only while some row has one */
const imageCell = (p: PlunderItem) =>
  html`<td class="img">${p.image ? html`<img src=${p.image} alt="" loading="lazy" referrerpolicy="no-referrer" />` : ''}</td>`;

const plunderTable = (items: PlunderItem[], marks?: PlunderMarks) => {
  const images = items.some((p) => p.image);
  return html`<table class="plunder-table">${items.map((p) => {
    const loot = html`${images ? imageCell(p) : ''}<td><b>${p.name}</b><br />${p.items.map(
      (i, n) => html`${n ? html`<br />` : ''}${formatNumber(i.amount)} ${i.label}`,
    )}</td>`;
    const muted = p.important ? '' : ' muted';
    if (!marks) return html`<tr class=${muted.trim()}>${loot}</tr>`;
    const marked = marks.marked(p.building);
    const toggle = () => marks.toggle(p.building);
    return html`<tr class=${`plunder-row${muted}${marked ? ' marked' : ''}`} role="button" tabindex="0"
      aria-pressed=${String(marked)} data-tip=${t(marked ? 'sabotage.unmarkInGame' : 'sabotage.markInGame')}
      @click=${toggle} @keydown=${pressKeys(toggle)}>${loot}<td class="mark">${headerIcons.mapPin(marked)}</td></tr>`;
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

const plunderTab = (vm: SabotageVm, marks?: PlunderMarks) => html`
  ${
    vm.plundered?.last
      ? html`<p class="muted">${vm.plundered.totals}</p>`
      : html`<p class="muted">${t('sabotage.neverPlundered')}</p>`
  }
  ${
    vm.plunderable.length === 0
      ? html`<p class="muted">${t('sabotage.nothingPlunderable')}</p>`
      : plunderTable(vm.plunderable, marks)
  }
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
 * plunderable buildings in the game. Head and tab bar stay on top while the tab scrolls under them.
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
      }${playerMarks ? html` ${pvpMarks(vm.player, playerMarks.plunder, playerMarks.noAttack)}` : ''}
        <span class="muted">${t('sabotage.era')}: ${vm.player.era}</span></span>${noteButton(ui)}</p>
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
    ${ui.tab === 'plunder' ? plunderTab(vm, marks) : fightTab(vm)}`;
}
