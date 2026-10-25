import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../../core/texts';
import type { ArmyValues } from '../../domain/assess-city';
import { battleDetailsView } from '../../ui/battle-details';
import { externalLink } from '../../ui/links';
import { starButton } from '../../ui/star';
import type { PlunderItem, SabotageVm } from './view-model';

const percent = (n: number) => `${formatNumber(n)} %`;

const armyCells = (army: ArmyValues | undefined) =>
  army
    ? html`<td class="num">${percent(army.attack)}</td><td class="num">${percent(army.defense)}</td>`
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
    <tr><td>${t('sabotage.plunderRepel')}</td><td class="num" colspan="2">${percent(repel)}</td></tr>
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

const plunderTable = (items: PlunderItem[], marks?: PlunderMarks) =>
  html`<table>${items.map((p) => {
    const loot = html`<td>${p.name}</td>
      <td>${p.items.map((i) => html`${formatNumber(i.amount)} ${i.label}<br />`)}</td>`;
    const muted = p.important ? '' : ' muted';
    if (!marks) return html`<tr class=${muted.trim()}>${loot}</tr>`;
    const marked = marks.marked(p.building);
    const toggle = () => marks.toggle(p.building);
    return html`<tr class=${`plunder-row${muted}${marked ? ' marked' : ''}`} role="button" tabindex="0"
      aria-pressed=${String(marked)} data-tip=${t(marked ? 'sabotage.unmarkInGame' : 'sabotage.markInGame')}
      @click=${toggle} @keydown=${pressKeys(toggle)}>${loot}</tr>`;
  })}</table>`;

function plunderedPart({ last, totals }: NonNullable<SabotageVm['plundered']>) {
  if (!last) return html`<p class="muted">${t('sabotage.neverPlundered')}</p>`;
  if (last.repelled) {
    const text = last.building
      ? t('sabotage.lastRepelledAt', { when: last.when, building: last.building })
      : t('sabotage.lastRepelled', { when: last.when });
    return html`<p>${text}<br />${totals}</p>`;
  }
  return html`<p>${t('sabotage.lastPlunder', { when: last.when, building: last.building })}: ${last.loot}
      ${last.doubleLoot ? html`<b>${t('plunder.doubleLoot')}</b>` : ''}
    <br />${totals}</p>`;
}

/** `note` is the note card of the visited player; `marks` points at plunderable buildings in the game */
export function sabotageView(
  vm: SabotageVm | undefined,
  note?: TemplateResult,
  marks?: PlunderMarks,
  /** puts the star on the visited player or takes it away */
  markPlayer?: (marked: boolean) => void,
): TemplateResult {
  if (!vm) return html`<p class="muted">${t('sabotage.noVisit')}</p>`;
  return html`
    <p><b>${externalLink(vm.player.name, vm.player.url)}</b>${
      vm.player.marked !== undefined && markPlayer
        ? html` ${starButton(vm.player.marked, () => markPlayer(!vm.player.marked))}`
        : ''
    }${
      vm.player.guild
        ? html` <span class="muted">[${externalLink(vm.player.guild.name, vm.player.guild.url)}]</span>`
        : ''
    }
      <br /><span class="muted">${t('sabotage.era')}: ${vm.player.era}</span>
      <br />${vm.attack.kind === 'plunderable' ? html`<b>${vm.attack.text}</b>` : vm.attack.text}</p>
    ${note ?? ''}
    ${vm.lootable ? '' : html`<p class="warn">${t('sabotage.notLootable')}</p>`}
    ${
      vm.attackedMe
        ? html`<p>${t('sabotage.attackedMe', { when: vm.attackedMe.when, result: vm.attackedMe.what })}
          <br />${vm.attackedMe.totals}</p>`
        : ''
    }
    ${vm.army ? armyTable(vm.army, vm.plunderRepel, vm.measured) : ''}
    ${
      vm.lastBattle
        ? html`<details><summary>${t('sabotage.lastBattle', { when: vm.lastBattle.when, result: vm.lastBattle.result })}</summary>
            ${battleDetailsView(vm.lastBattle.details)}</details>`
        : ''
    }
    ${vm.plundered ? html`<h2>${t('sabotage.plundered')}</h2>${plunderedPart(vm.plundered)}` : ''}
    <h2>${t('sabotage.plunderable')}</h2>
    ${
      vm.plunderable.length === 0
        ? html`<p class="muted">${t('sabotage.nothingPlunderable')}</p>`
        : plunderTable(vm.plunderable, marks)
    }
    ${vm.incomplete ? html`<p class="warn">${t('sabotage.incomplete')}</p>` : ''}`;
}
