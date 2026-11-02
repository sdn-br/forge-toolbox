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
  render(plunderCard(vm), root);
  return root;
};

describe('plunder card', () => {
  it('puts the Double Loot mark on a badge of the building image, not after the name', () => {
    const root = card({ image: 'https://cdn/building.png' });
    expect(root.querySelector('.building-img > img')?.getAttribute('src')).toBe('https://cdn/building.png');
    expect(root.querySelector('.building-img .double-loot-badge img.double-loot')?.getAttribute('src')).toBe(
      'https://cdn/double-loot.png',
    );
    expect(root.querySelector('p .double-loot')).toBeNull();
  });

  it('keeps the mark after the name without a building image, and the word while the mark image is not known', () => {
    const plain = card({});
    expect(plain.querySelector('.double-loot-badge')).toBeNull();
    expect(plain.querySelector('p img.double-loot')).not.toBeNull();
    const word = card({ image: 'https://cdn/building.png', doubleLootIcon: undefined });
    expect(word.querySelector('.double-loot-badge')).toBeNull();
    expect(word.querySelector('p')?.textContent).toContain('Plünderung verdoppelt');
  });

  it('shows no mark without Double Loot', () => {
    const root = card({ image: 'https://cdn/building.png', doubleLoot: false });
    expect(root.querySelector('.double-loot, .double-loot-badge')).toBeNull();
  });
});
