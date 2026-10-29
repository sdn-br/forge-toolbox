// The backup copy on the game page: it starts writing and checks at the start whether a copy or old toolbox data wait
// for this profile. The dialog "Gefundene Daten" offers them, at the start or from the settings ("Gefundene Daten
// übernehmen"), one row per source.
import { html, type TemplateResult } from 'lit-html';
import type { Area } from '../../../backup/merge';
import type { FoundOffer, FoundSource } from '../../backup/backup-copy';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { formatFullDateTime, formatNumber, type TextKey, t } from '../../core/texts';

/** "start": offered by the toolbox, with "Nein" and "Später"; "manual": opened from the settings */
type Mode = 'start' | 'manual';

const AREAS: { area: Area; label: TextKey }[] = [
  { area: 'pvp', label: 'data.area.pvp' },
  { area: 'notes', label: 'data.area.notes' },
  { area: 'greatBuildings', label: 'data.area.greatBuildings' },
  { area: 'settings', label: 'data.area.settings' },
];

/** the name of a source in its row */
const sourceLabel = (offer: FoundOffer) =>
  offer.source === 'legacy'
    ? t('found.legacy', { version: offer.version ?? '' })
    : t('found.backupCopy', { date: formatFullDateTime(offer.createdAt ?? 0) });

interface DialogState {
  mode: Mode;
  /** null while the search runs */
  offers: FoundOffer[] | null;
  /** the chosen areas per offer, same order */
  chosen: Set<Area>[];
  busy: boolean;
  status: string;
}

export const backupCopyFeature: Feature = {
  id: 'backupCopy',
  setup(ctx) {
    const copy = ctx.backupCopy;
    let state: DialogState = { mode: 'start', offers: null, chosen: [], busy: false, status: '' };

    const show = (mode: Mode, offers: FoundOffer[] | null) => {
      state = {
        mode,
        offers,
        chosen: (offers ?? []).map(
          ({ choice }) => new Set(AREAS.map((a) => a.area).filter((area) => choice.checked[area])),
        ),
        busy: false,
        status: '',
      };
      box.open();
    };

    /** "Nein" and "Später" answer for every source shown */
    const answer = (fn: (sources: FoundSource[]) => Promise<void>) => () => {
      const sources = (state.offers ?? []).map((o) => o.source);
      box.close();
      fn(sources).catch((error) => logError('saving the answer failed', error));
    };

    const take = () => {
      const offers = state.offers ?? [];
      state.busy = true;
      state.status = t('found.taking');
      box.update();
      copy.take(offers.map((offer, i) => ({ offer, areas: state.chosen[i] ?? new Set<Area>() }))).catch((error) => {
        logError('taking the found data failed', error);
        state.busy = false;
        state.status = t('found.failed');
        box.update();
      });
    };

    const row = (offer: FoundOffer, i: number): TemplateResult => {
      const chosen = state.chosen[i] ?? new Set<Area>();
      const toggle = (area: Area) => (e: Event) => {
        if ((e.target as HTMLInputElement).checked) chosen.add(area);
        else chosen.delete(area);
        box.update();
      };
      return html`<tr>
        <th scope="row">${sourceLabel(offer)}</th>
        ${AREAS.map(
          ({ area, label }) => html`<td>
            <label><input type="checkbox" aria-label=${t(label)} .checked=${chosen.has(area)}
              ?disabled=${offer.choice.counts[area] === 0 || state.busy} @change=${toggle(area)} />
              ${formatNumber(offer.choice.counts[area])}</label>
          </td>`,
        )}
      </tr>`;
    };

    const render = (): TemplateResult => {
      const { mode, offers, chosen, busy } = state;
      if (offers === null) return html`<p class="muted">${t('found.searching')}</p>`;
      if (offers.length === 0)
        return html`<p>${t('found.none')}</p>
          <button class="action" @click=${() => box.close()}>${t('found.cancel')}</button>`;
      const any = chosen.some((areas) => areas.size > 0);
      return html`<p>${t(mode === 'start' ? 'found.introStart' : 'found.introManual')}</p>
        <table class="found">
          <thead><tr>
            <th scope="col">${t('found.source')}</th>
            ${AREAS.map(({ label }) => html`<th scope="col">${t(label)}</th>`)}
          </tr></thead>
          <tbody>${offers.map(row)}</tbody>
        </table>
        <p class="muted">${t('found.takeHint')}</p>
        <p>
          <button class="action" ?disabled=${busy || !any} @click=${take}>${t('found.take')}</button>
          ${
            mode === 'start'
              ? html`<button class="action" ?disabled=${busy} @click=${answer((s) => copy.decline(s))}>${t('found.no')}</button>
                <button class="action" ?disabled=${busy} @click=${answer((s) => copy.later(s))}>${t('core.later')}</button>`
              : html`<button class="action" ?disabled=${busy} @click=${() => box.close()}>${t('found.cancel')}</button>`
          }
        </p>
        ${
          mode === 'start'
            ? html`<p class="muted">${t(offers.some((o) => o.source === 'backupCopy') ? 'found.answerHintCopy' : 'found.answerHint')}</p>`
            : ''
        }
        ${state.status ? html`<p class="status" role="status">${state.status}</p>` : ''}`;
    };

    const box = ctx.createBox({ id: 'found-data', title: () => t('found.title'), width: 460, render });

    copy.watch();
    copy
      .start()
      .then((offers) => offers.length > 0 && show('start', offers))
      .catch((error) => logError('looking for a backup copy failed', error));

    ctx.bus.on('foundData.open', () => {
      show('manual', null);
      copy
        .find()
        .then((offers) => {
          if (state.mode !== 'manual' || state.offers !== null) return;
          show('manual', offers);
        })
        .catch((error) => {
          logError('looking for a backup copy failed', error);
          show('manual', []);
        });
    });
  },
};
