// Colors of the building groups on city maps, shared by every feature that draws a city.
import { t } from '../core/texts';
import { type BuildingCategory, CATEGORIES } from '../domain/city-grid';
import type { LegendItem } from './city-map';

export const CATEGORY_COLORS: Record<BuildingCategory, string> = {
  residential: '#5b8fd6',
  production: '#d6a84a',
  goods: '#9a6ad6',
  culture: '#5fb36a',
  military: '#c0504d',
  greatBuilding: '#e07b39',
  street: '#8c8378',
  special: '#3fb0b0',
  other: '#a08a6a',
};

const BACKGROUND = '#2b1d10';

/** `color` moved towards `toward` by `amount` (0 keeps it, 1 is `toward`); both as #rrggbb */
export function mix(color: string, toward: string, amount: number): string {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const parts = [0, 1, 2].map((i) => Math.round(channel(color, i) + (channel(toward, i) - channel(color, i)) * amount));
  return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** the group color faded into the background, for buildings that are not the point of a map */
export const mutedColor = (category: BuildingCategory) => mix(CATEGORY_COLORS[category], BACKGROUND, 0.6);

export const categoryLegend = (muted = false): LegendItem[] =>
  CATEGORIES.map((c) => ({ color: muted ? mutedColor(c) : CATEGORY_COLORS[c], label: t(`category.${c}`) }));
