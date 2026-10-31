import { html } from 'lit-html';
import { OPEN_DATA_PAGE } from '../../shared/messages';
import type { Feature, FeatureContext } from '../core/feature';
import { logError } from '../core/log';
import { type OtherProfile, type ProfileCopy, profileLabel } from '../core/profile-copy';
import {
  choiceDef,
  formatNumberList,
  type ListSettingDef,
  type NumberSettingDef,
  parseNumberList,
  type SettingDef,
  type Settings,
  saveSetting,
} from '../core/settings';
import type { SettingsControl } from '../core/settings-controls';
import { type TextKey, t } from '../core/texts';
import { FACTOR_STEP, factorOf, percentOf } from '../domain/gb-factor';
import { icons } from '../ui/icons';
import { keepKeys } from '../ui/inputs';

/** settings: a column of module icons, the chosen module beside it */
const settingsCss = `
p.setting-hint { margin: 0 0 4px 22px; }
/* the answers of a question stay side by side, so they never part across two lines */
.answers { white-space: nowrap; }
/* settings: a column of module icons, the chosen module beside it */
.settings-layout { display: flex; gap: 8px; align-items: flex-start; }
.settings-nav { flex: 0 0 auto; display: flex; flex-direction: column; gap: 2px; position: sticky; top: 0; }
.settings-nav button { all: unset; cursor: pointer; width: 28px; height: 28px; display: grid; place-items: center;
  font-size: 16px; border-radius: 4px; color: var(--ink); background: var(--btn); border-left: 3px solid transparent; }
.settings-nav button:hover, .settings-nav button.active { --btn: var(--btn-hover); }
.settings-nav button.active { border-left-color: var(--accent); }
.settings-nav svg { display: block; width: 20px; height: 20px; }
.settings-main { flex: 1; min-width: 0; }
.settings-main h2:first-child { margin-top: 2px; }
.settings-main h3 { font-size: 12px; margin: 10px 0 4px; color: var(--muted); }
`;

type NumberDef = NumberSettingDef | ListSettingDef;

/** a value as the settings box shows it: a factor setting reads 90 as 1,9 */
const shown = (d: NumberDef, n: number) => (d.asFactor ? factorOf(n) : n);
const stored = (d: NumberDef, n: number) => (d.asFactor ? percentOf(n) : n);

/** an empty or broken number keeps the stored value */
function saveNumber(settings: Settings, d: NumberSettingDef, input: HTMLInputElement) {
  const value = input.valueAsNumber;
  if (Number.isFinite(value)) saveSetting(settings.of(d), stored(d, value));
  else input.value = String(shown(d, settings.of(d).get()));
}

const listText = (settings: Settings, d: ListSettingDef) =>
  formatNumberList(
    settings
      .of(d)
      .get()
      .map((n) => shown(d, n)),
  );

/** the stored list is cleaned when read, so an empty field gives the default again */
function saveList(settings: Settings, d: ListSettingDef, input: HTMLInputElement) {
  saveSetting(
    settings.of(d),
    parseNumberList(input.value).map((n) => stored(d, n)),
  );
  input.value = listText(settings, d);
}

const control = (settings: Settings, d: SettingDef) =>
  html`${input(settings, d)}${d.hint ? html`<p class="muted setting-hint">${t(d.hint)}</p>` : ''}`;

function input(settings: Settings, d: SettingDef) {
  switch (d.kind) {
    case 'text':
      return html`<label>${t(d.label)}<input type="text" .value=${settings.of(d).get()} @keydown=${keepKeys}
        @change=${(e: Event) => saveSetting(settings.of(d), (e.target as HTMLInputElement).value)} /></label>`;
    case 'list':
      return html`<label>${t(d.label)}<input type="text" .value=${listText(settings, d)}
        @keydown=${keepKeys} @change=${(e: Event) => saveList(settings, d, e.target as HTMLInputElement)} /></label>`;
    case 'number':
      return html`<label>${t(d.label)}<input type="number" min=${shown(d, d.min)} max=${shown(d, d.max)}
        step=${d.asFactor ? FACTOR_STEP : (d.step ?? 1)} .value=${String(shown(d, settings.of(d).get()))}
        @keydown=${keepKeys} @change=${(e: Event) => saveNumber(settings, d, e.target as HTMLInputElement)} /></label>`;
    case 'choice':
      return html`<label>${t(d.label)}<select @change=${(e: Event) => saveSetting(settings.of(d), (e.target as HTMLSelectElement).value)}>
        ${d.choices.map((c) => html`<option value=${c.value} .selected=${settings.of(d).get() === c.value}>${t(c.label)}</option>`)}
      </select></label>`;
    case 'toggle':
      return html`<label><input type="checkbox" .checked=${settings.of(d).get()}
        @change=${(e: Event) => saveSetting(settings.of(d), (e.target as HTMLInputElement).checked)} />${t(d.label)}</label>`;
  }
}

const openDataPage = () =>
  chrome.runtime.sendMessage(OPEN_DATA_PAGE).catch((error) => logError('opening the data page failed', error));

const profileKey = ({ profile }: OtherProfile) => `${profile.world}:${profile.player}`;

/**
 * "Einstellungen von einem anderen Profil übernehmen": a choice of the other profiles and a button that asks once more
 * in a line of its own, naming the profile. The question stays through redraws of the box until it is answered, another
 * profile is chosen, the box shows another group or closes; a question that lasted one drawing only was gone again when a click raised the box.
 */
function copyControl(copy: ProfileCopy, update: () => void): SettingsControl {
  let others: OtherProfile[] | undefined;
  let chosen: string | undefined;
  let asking = false;
  let loading = false;
  const load = () => {
    copy
      .others()
      .then((list) => {
        others = list;
        update();
      })
      .catch((error) => logError('reading the profiles failed', error));
  };
  const ask = (value: boolean) => {
    asking = value;
    update();
  };
  const render = () => {
    if (!others) {
      // read once per page load; a new profile comes with a game start, and that is a page load of its own
      if (!loading) load();
      loading = true;
      return '';
    }
    if (!others.length) return '';
    const list = others;
    const from = list.find((p) => profileKey(p) === chosen) ?? (list[0] as OtherProfile);
    const copyNow = () => copy.copyFrom(from.profile).catch((error) => logError('copying the settings failed', error));
    return html`<label>${t('settings.copyFrom')}<select @change=${(e: Event) => {
      chosen = (e.target as HTMLSelectElement).value;
      ask(false);
    }}>${list.map((p) => html`<option value=${profileKey(p)} .selected=${p === from}>${profileLabel(p)}</option>`)}</select></label>
      ${
        asking
          ? html`<p class="warn">${t('settings.copyConfirm', { profile: profileLabel(from) })}
              <span class="answers"><button class="action" @click=${copyNow}>${t('settings.copy')}</button>
              <button class="action" @click=${() => ask(false)}>${t('settings.copyCancel')}</button></span></p>`
          : html`<button class="action" @click=${() => ask(true)}>${t('settings.copy')}</button>
              <p class="muted setting-hint">${t('settings.copyHint')}</p>`
      }`;
  };
  return {
    group: 'settings.core',
    section: 'settings.data',
    render,
    reset: () => {
      asking = false;
    },
  };
}

/** the menu entry and the general settings show it */
const ICON = icons.settings;
/** the menu's icon size in pixels, as a choice */
const MENU_SIZE = choiceDef({
  key: 'core.menuSize',
  group: 'settings.core',
  label: 'settings.menuSize',
  default: '35',
  choices: [
    { value: '30', label: 'settings.menuSize30' },
    { value: '35', label: 'settings.menuSize35' },
    { value: '45', label: 'settings.menuSize45' },
  ],
});
/** the view choice of the group shown */
const TAB = 'settings.group';

declare module '../core/shell' {
  interface OpenableBoxes {
    /** the settings button of a box opens the settings at the group of its feature */
    settings: [group: string];
  }
}

/** The settings box. */
export const settingsFeature: Feature = { id: 'settings', setup };

function setup(ctx: FeatureContext) {
  const menuSize = ctx.settings.register(MENU_SIZE);
  const applyMenuSize = () => ctx.menu.setIconSize(Number(menuSize.get()));
  applyMenuSize();
  menuSize.onChange(applyMenuSize);

  ctx.settings.registerGroup('settings.core', ICON);

  /** the group shown, kept across page loads; a box's settings button picks the group of its feature */
  const shownGroup = (groups: string[]) => {
    const chosen = ctx.ui.pref(TAB);
    return chosen && groups.includes(chosen) ? chosen : groups[0];
  };
  const select = (group: string) => {
    ctx.settingsControls.reset();
    ctx.ui.savePref(TAB, group);
    box.update();
  };
  const reset = () => ctx.settingsControls.reset();
  const box = ctx.createBox({
    id: 'settings',
    css: settingsCss,
    title: () => t('settings.title'),
    width: 380,
    maxHeight: 0.8,
    onClose: reset,
    render: () => {
      // the general settings first, then the features in the order they registered
      const groups = [...new Set(['settings.core', ...ctx.settings.defs.map((d) => d.group)])];
      const group = shownGroup(groups) ?? 'settings.core';
      const defs = ctx.settings.defs.filter((d) => d.group === group && !ctx.settingsControls.claimed(d));
      const sections = [
        ...new Set(
          [...defs.map((d) => d.section), ...ctx.settingsControls.sections(group)].filter((s) => s !== undefined),
        ),
      ];
      /** the defs of a place, then the controls of the features for it */
      const place = (
        section?: TextKey,
      ) => html`${defs.filter((d) => d.section === section).map((d) => control(ctx.settings, d))}
        ${ctx.settingsControls.at(group, section).map((c) => c.render())}`;
      return html`<div class="settings-layout">
        <nav class="settings-nav">${groups.map(
          (g) => html`<button class=${g === group ? 'active' : ''} data-tip=${t(g as TextKey)}
            aria-label=${t(g as TextKey)} @click=${() => select(g)}>${ctx.settings.groupIcon(g) ?? '•'}</button>`,
        )}</nav>
        <div class="settings-main">
          <h2>${t(group as TextKey)}</h2>
          ${place()}
          ${sections.map((section) => html`<h3>${t(section)}</h3>${place(section)}`)}
        </div>
      </div>`;
    },
  });
  ctx.settings.onChange(() => box.update());
  ctx.settingsControls.onUpdate(() => box.update());
  ctx.registerOpen('settings', (group) => {
    reset();
    ctx.ui.savePref(TAB, group);
    box.open();
  });
  // the first control of the data section; the controls of other features follow in the order they registered
  ctx.settingsControls.add({
    group: 'settings.core',
    section: 'settings.data',
    render: () => html`<button class="action" @click=${openDataPage}>${t('settings.manageData')}</button>
      <p class="muted setting-hint">${t('settings.manageDataHint')}</p>`,
  });
  ctx.menu.add({ id: 'settings', icon: ICON, label: () => t('menu.settings'), action: () => box.toggle() });
}

/**
 * The last control of the data section: it needs the other profiles, which only the settings get. A feature of its own,
 * set up after the others, because the controls of a place draw in registration order and this one closes the section.
 */
export const profileCopyFeature = (profileCopy: ProfileCopy): Feature => ({
  id: 'profileCopy',
  setup: (ctx) => {
    ctx.settingsControls.add(copyControl(profileCopy, () => ctx.settingsControls.update()));
  },
});
