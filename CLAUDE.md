# Forge Toolbox

Browser extension for Forge of Empires on its own codebase. Concept: `docs/konzept.md` (architecture, decisions, links to one file per feature in `docs/features/`). Data model: `docs/datenmodell.md` (principles, game response → store, links to one file per domain in `docs/datenmodell/`). Read only the feature and domain files a task touches.

## Language

- Business domain language: German.

Code, comments, tests, README, commit and PR text in English. Concept and architecture docs in German.

## Repo rules

- Do not reach for brodos-dev skills or agents on your own. Its GitLab and compliance workflows (mr-flow, harden-spec, afk-pipeline and similar) do not fit here. A brodos-dev skill the user invokes explicitly is fine, with the agents it needs.
- No `Co-Authored-By: Claude` trailer in commits.
- Never commit directly to `main`. Feature branch plus PR. Push and PR only with explicit approval.
- No own requests to the Inno game servers. The extension only listens to game traffic. Exception: metadata and assets from the Inno CDN, as the game loads them.
- UI buttons: icon instead of a word where sensible (own SVGs from `src/content/ui/icons.ts`, no emoji or glyphs), the word in the tooltip and `aria-label`. A new button may start with text; then ask the user whether it should get an icon later and, if so, add it to "Offene Icons" in `docs/konzept.md` (UI-Kit).
- No code from the FoE Helfer, FoE Toolbox or Forge Hammer. Their features are reimplemented from the concept only.
