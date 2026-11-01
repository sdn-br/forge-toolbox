// The calculator of the box: the last foreign construction opened in the game, its places and the tone for a place
// that pays.
import type { TemplateResult } from 'lit-html';
import type { PlayerId } from '../../../../shared/ids';
import { FORGE_POINTS } from '../../../../shared/resources';
import type { FeatureContext } from '../../../core/feature';
import { type Setting, saveSetting } from '../../../core/settings';
import type { Construction } from '../../../model/great-building';
import type { Box } from '../../../ui/box';
import { createChime } from '../../../ui/sound';
import { ignores } from '../../shared/gb-lookups';
import type { FoldShow } from '../fold-state';
import type { GbShared } from '../lookups';
import { type GbCalculatorActions, gbCalculatorView } from './view';
import { type GbCalculatorVm, gbCalculatorViewModel } from './view-model';

export interface CalculatorSettings {
  factor: Setting<number>;
  factorArc: Setting<boolean>;
  factorButtons: Setting<number[]>;
  arcButton: Setting<boolean>;
  sound: Setting<boolean>;
}

export interface CalculatorHooks {
  /** redraws both sections */
  refresh(): void;
  /** the calculator follows a foreign building just opened, before it redraws; the fold rules hang here */
  followed(owner: PlayerId): void;
  /** plays the sound for a profitable place */
  tone(): void;
}

export interface CalculatorSection {
  /** the shown foreign construction; an own one opened later leaves it in the box */
  shown(): Construction | undefined;
  /** the calculator shows a building, so the other part can fold */
  hasBuilding(): boolean;
  /** computes the view of the calculator anew; the caller redraws the box */
  update(shared: GbShared): void;
  render(show: FoldShow, toggle: () => void): TemplateResult;
}

export function createCalculatorSection(
  ctx: FeatureContext,
  box: Box,
  settings: CalculatorSettings,
  hooks: CalculatorHooks,
): CalculatorSection {
  const { factor, factorArc, factorButtons, arcButton, sound } = settings;
  /** the last foreign construction; an own one opened later leaves it in the box */
  let shown: Construction | undefined;
  let vm: GbCalculatorVm = { kind: 'none' };
  /** keyed by what the tone is for, so a redraw with the same places stays quiet */
  const chime = createChime(hooks.tone);
  /** the later level the box previews; undefined shows the construction */
  let preview: number | undefined;

  const actions: GbCalculatorActions = {
    setFactor: (value) => {
      saveSetting(factor, value);
      saveSetting(factorArc, false);
    },
    useArc: () => saveSetting(factorArc, true),
    previewLevel: (level) => {
      preview = level;
      hooks.refresh();
    },
    toggleMark: (marked) => {
      if (shown) ctx.greatBuildings.setMarked(shown.owner, shown.entityId, marked);
    },
    toggleOwnerMark: (marked) => {
      if (shown) ctx.players.setMarked(shown.owner, marked);
    },
    toggleIgnore: (ignored) => {
      if (shown) ctx.greatBuildings.setIgnored(shown.owner, shown.entityId, ignored);
    },
    toggleOwnerIgnore: (ignored) => {
      if (shown) ctx.players.setIgnored(shown.owner, ignored);
    },
  };

  /** the shown building, or its owner, is ignored */
  const shownIgnored = () => shown !== undefined && ignores(ctx, shown.owner, shown.entityId);

  /** a tone once per new state of the places that has a profitable one, and once for a level up */
  const maybeTone = (leveled: boolean) => {
    if (vm.kind !== 'current' || !sound.get() || shownIgnored()) return;
    const places = vm.profitable.map((p) => `${p.rank}:${p.safeCost}`).join(',');
    const key = leveled
      ? `leveled:${vm.leveled}`
      : vm.profitable.length > 0
        ? `${vm.header.name}:${places}`
        : undefined;
    if (key !== undefined) chime.ring(key);
  };

  const follow = () => {
    const current = ctx.greatBuildings.current();
    if (!current || current.own) return false;
    shown = current;
    return true;
  };

  ctx.bus.on('greatBuilding.opened', ({ owner, own }) => {
    if (own || !follow()) return;
    hooks.followed(owner);
    chime.reset();
    preview = undefined;
    hooks.refresh();
    // an ignored building or player does not open the box; by hand it shows with a warning
    if (shownIgnored()) return;
    box.open();
    maybeTone(false);
  });
  ctx.bus.on('greatBuilding.changed', ({ reason }) => {
    if (!follow()) return;
    hooks.refresh();
    maybeTone(reason === 'leveled');
  });

  return {
    shown: () => shown,
    hasBuilding: () => vm.kind !== 'none' && vm.kind !== 'noEntity',
    update: ({ lookups, greatBuilding, arcBonus }) => {
      vm = gbCalculatorViewModel({
        ...lookups,
        construction: shown,
        fpBar: ctx.resources.known ? ctx.resources.amount(FORGE_POINTS) : undefined,
        fpPackages: ctx.inventory.knowsPackages ? ctx.inventory.forgePointPackages() : undefined,
        arcBonus,
        factor: { value: factor.get(), arc: factorArc.get() },
        factorButtons: factorButtons.get(),
        arcButton: arcButton.get(),
        previewLevel: preview,
        greatBuilding,
      });
    },
    render: (show, toggle) =>
      gbCalculatorView(vm, actions, { folded: show === 'folded', foldable: show !== 'alone', toggle }),
  };
}
