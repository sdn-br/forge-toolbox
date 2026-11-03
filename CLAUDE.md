# Forge Toolbox

Browser extension for Forge of Empires on its own codebase. Concept: `docs/konzept.md` (architecture, decisions, links to one file per feature in `docs/features/`, UI kit rules in `docs/ui-kit.md`). Data model: `docs/datenmodell.md` (principles, game response → store, links to one file per domain in `docs/datenmodell/`). Read only the feature and domain files a task touches.

## Language

- Business domain language: German.

Code, comments, tests, README, commit and PR text in English. Concept and architecture docs in German.

## Repo rules

- Do not reach for brodos-dev skills or agents on your own. Its GitLab and compliance workflows (mr-flow, harden-spec, afk-pipeline and similar) do not fit here. A brodos-dev skill the user invokes explicitly is fine, with the agents it needs.
- No `Co-Authored-By: Claude` trailer in commits.
- Never commit directly to `main`. Feature branch plus PR. Push and PR only with explicit approval.
- No own requests to the Inno game servers. The extension only listens to game traffic. Exception: metadata and assets from the Inno CDN, as the game loads them.
- UI buttons: icon instead of a word where sensible (own SVGs from `src/content/ui/icons.ts`, no emoji or glyphs), the word in the tooltip and `aria-label`. A new button may start with text; then ask the user whether it should get an icon later and, if so, add it to "Offene Icons" in `docs/ui-kit.md`.
- No code from the FoE Helfer, FoE Toolbox or Forge Hammer. Their features are reimplemented from the concept only.

## Workflow

- Branch in the main checkout, no worktree, unless two branches are open at once. A worktree needs its own `npm ci` (a symlinked `node_modules` breaks Vitest with happy-dom).
- Check with `npm run check`, build with `npm run build`. The user reloads `dist` in the browser's extension page; it cannot be done from here.
- Acceptance is a browser test by the user in Edge. Claude in Chrome can drive the game (de20, de10): toolbox UI through the shadow DOM hosts `[data-forge-toolbox=<box>]`, the menu `nav.menu`, via `javascript_tool`. It cannot open `chrome-extension://` pages, so the extension's database is read by a snippet the user runs in the console of "Daten verwalten".
- Test data: in the settings "Spielverkehr aufzeichnen", reload the game, save the recording (lands in Downloads, private, never commit it), turn it into a fixture with `scripts/make-fixture.py` (anonymised). Briefs for agents carry the real data shape (enums, nesting), not only field names.
- Boost reference: own city `BoostService.getAllBoosts`; another player's army only through a real battle `BattlefieldService.startByBattleType`. Never spend diamonds in the game.
- Icons and visual choices start as an HTML preview in the scratchpad; build them in only after the user picked one.
- GitHub through `gh` (account sdn-br): PR, then `gh pr merge <n> --squash --match-head-commit <full sha>` (GitHub refuses a short SHA) as a command of its own, never chained with the cleanup. GitHub deletes the remote branch after the merge; delete the local one. Push with git.
