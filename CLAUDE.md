# Forge Toolbox

Browser extension for Forge of Empires on its own codebase. Concept: `docs/konzept.md`.

## Language

- Business domain language: German.

Code, comments, tests, README, commit and PR text in English. Concept and architecture docs in German.

## Repo rules

- No brodos-dev skills or agents in this repo.
- No `Co-Authored-By: Claude` trailer in commits.
- Never commit directly to `main`. Feature branch plus PR. Push and PR only with explicit approval.
- No own requests to the Inno game servers. The extension only listens to game traffic. Exception: metadata and assets from the Inno CDN, as the game loads them.
- No code from the FoE Helfer, FoE Toolbox or Forge Hammer. Their features are reimplemented from the concept only.
