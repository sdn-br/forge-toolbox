// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it } from 'vitest';
import type { PlunderVm } from '../src/content/features/shared/plunder';
import { plunderCard } from '../src/content/ui/plunder';

const card = (change: Partial<PlunderVm>) => {
  const root = document.createElement('div');
  const vm: PlunderVm = {
    when: 'heute 06:46',
    outcome: 'plundered',
    building: 'Ein sehr langer Name eines Eventgebäudes – Stufe 12',
    loot: ['24 Forge-Punkte'],
    doubleLoot: true,
    doubleLootIcon: 'https://cdn/double-loot.png',
    ...change,
  };
  render(plunderCard(vm, vm.when), root);
  return root;
};

describe('plunder card', () => {
  it('puts the Double Loot mark after the time, in line with the name beside the image, not after the name', () => {
    const root = card({ image: 'https://cdn/building.png' });
    const when = root.querySelector('p.plunder-when');
    expect(when?.classList.contains('with-image')).toBe(true);
    expect(when?.textContent).toContain('heute 06:46');
    expect(when?.querySelector('img.double-loot')?.getAttribute('src')).toBe('https://cdn/double-loot.png');
    expect(root.querySelector('.plunder-card .double-loot')).toBeNull();
    expect(root.querySelector('.plunder-card img.building-img')?.getAttribute('src')).toBe('https://cdn/building.png');
  });

  it('keeps the mark after the time without a building image, and the word while the mark image is not known', () => {
    const plain = card({});
    expect(plain.querySelector('p.plunder-when')?.classList.contains('with-image')).toBe(false);
    expect(plain.querySelector('p.plunder-when img.double-loot')).not.toBeNull();
    const word = card({ doubleLootIcon: undefined });
    expect(word.querySelector('p.plunder-when')?.textContent).toContain('Plünderung verdoppelt');
  });

  it('puts the loot tooltip on the loot when there is one, and none without', () => {
    const tip = '5 Wein (Bronzezeit)\n2 Forge-Punkte';
    const loot = (root: HTMLElement) => root.querySelector<HTMLElement>('.plunder-card p:last-child');
    expect(loot(card({ loot: ['5 Wein', '2 Forge-Punkte'], lootTip: tip }))?.dataset.tip).toBe(tip);
    expect(loot(card({}))?.hasAttribute('data-tip')).toBe(false);
  });

  it('shows no mark without Double Loot', () => {
    const root = card({ image: 'https://cdn/building.png', doubleLoot: false });
    expect(root.querySelector('.double-loot')).toBeNull();
  });
});
