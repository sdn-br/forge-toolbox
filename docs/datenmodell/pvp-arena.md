# PvP-Arena

Stand 2026-11-16. Grundlage: zwei Aufnahmen auf de10 vom 2026-11-10. In der ersten öffnet der Spieler die Arena und führt fünf Autokämpfe (Testfall `test/fixtures/arena.json`), in der zweiten zusätzlich einen manuellen Kampf mit 23 Zügen, der verloren geht (Testfall `test/fixtures/arena-manual-battle.json`). Beide Testfälle macht `scripts/make-fixture.py` (Modi `arena` und `arena-manual`) anonym.

**Entscheidung** (Nutzer, 2026-11-16): eigene Tabellen, nicht mit der Nachbarschaft gemischt. Arena-Kämpfe erlauben keine Plünderung, der Gegner wird gelost statt gewählt, und die Auswertung der Nachbarschaft (Reiter „Kämpfe“, Zuordnung zu Plünderungen, Box „Besuchte Stadt“) soll sie nicht sehen. Die Oberfläche ist der Reiter „Arena“ der PvP-Box (siehe [Konzept](../konzept.md)). Diese Datei beschreibt nur die Datenschicht.

## Spielformat

Alle Zeiten des Spiels sind Unix-Sekunden. Ein Spieler kommt in der Arena immer als `PVPArenaPlayer`: `{ player: { player_id, name, avatar }, rankingPoints? }`.

- **`PVPArenaService.getOverview`** kommt, wenn der Spieler die Arena öffnet: `{ currentPlayer: { player, rankingPoints }, nextRefreshAt, opponents, actions }`.
  - `opponents`: die drei Gegner im Angebot, je `{ opponentId, opposingPlayer: { player }, rewardPoints, difficulty: 'easy' | 'medium' | 'hard', era, defenseArmyBoosts: { attackBoost, defenseBoost } }`. `opponentId` ist die Nummer des Platzes und wechselt mit jeder neuen Auslosung.
  - `actions`: das Protokoll des Spiels, neueste zuerst, etwa zwei Tage. Je Zeile `{ time, otherPlayer: { player }, rankingPointsChange, type: 'attack' | 'defense' }`. `rankingPointsChange` hat ein Vorzeichen. Gesehen: 87 Zeilen, davon 68 gewonnene Angriffe (positiv), 12 verlorene Angriffe (negativ) und 7 Verteidigungen, alle negativ. Eine Zeile hat keine ID, beim nächsten Öffnen kommen dieselben Zeilen wieder.
- **Nach jedem Arena-Kampf** kommen in derselben Antwort: `PVPArenaService.addLog` (eine Zeile wie oben), `PVPArenaService.updatePlayer` (`{ player, rankingPoints }`, die eigenen Punkte danach), `PVPArenaService.updateOpponents` (die drei neuen Gegner wie oben), meist `PVPArenaService.getRankingOverview` und der Kampf. Beim Autokampf ist das die Antwort mit `startByBattleType`, beim manuellen die mit dem letzten `submitMove`. Die Zeit der neuen Zeile ist beim Autokampf die Startzeit des Kampfes, beim manuellen die Zeit des letzten Zugs (im Testfall 145 s nach dem Start). Die PvP-Box ordnet Zeile und Kampf darüber zu (siehe [Konzept](../konzept.md), Reiter „Arena“).
- **Knopf „Erneuern“** (gesehen 2026-11-17): Anfrage `PVPArenaService.refreshOpponents` ohne Daten, Antwort `{ currentPlayer: { player }, nextRefreshAt, opponents }`. `opponents` hat die Form der Übersicht, `currentPlayer` trägt hier keine Punkte, `nextRefreshAt` ist die Zeit in Sekunden, ab der wieder erneuert werden kann.
- **Arena-Kampf:** `BattlefieldService.startByBattleType` mit `battleType: { __class__: 'PVPArenaBattleType', type: 'pvp_arena', attackerPlayerId, defenderPlayerId, era, difficulty, opponentSerial, totalWaves }`. `opponentSerial` ist die `opponentId` des Gegners. Der Verteidiger steht nur im `battleType`: `defenderPlayerId` des Kampfes selbst fehlt beim Autokampf und ist beim Start eines manuellen Kampfes -1. Die verteidigenden Einheiten haben `ownerId` -1. Das Ergebnis steht wie in der Nachbarschaft in `state.winnerBit` (1 gewonnen, 2 verloren), die Punkte in `state.ranking_data.pvpArenaRankingPoints` (mit Vorzeichen, gesehen 400 und -628). Sonst gleicht der Kampf dem der Nachbarschaft (siehe [PvP](pvp.md)).
- `PVPArenaService.getRanking` und `getRankingOverview` werden noch nicht gelesen.

## ArenaBattle (eigene Arena-Kämpfe)

```ts
interface ArenaBattle extends Omit<FoughtBattle, 'plunderAt'> {
  points?: number;              // pvpArenaRankingPoints, mit Vorzeichen
  difficulty?: 'easy' | 'medium' | 'hard';
  opponentId?: number;          // opponentSerial
}
```

**Regeln**

- Gespeichert werden Arena-Kämpfe (`battleType.type === 'pvp_arena'`), in denen der eigene Spieler angreift. Gegner ist `battleType.defenderPlayerId`.
- Erkennung, Seiten, Boni, Runden und Ergebnis lesen dieselben Funktionen wie in der Nachbarschaft (`foughtOf` in `src/content/game/pvp.ts`). Autokampf und manueller Kampf laufen gleich, auch der wartende manuelle Kampf ist derselbe. Der wartende Kampf behält seinen Typ: Ein Arena-Kampf endet immer in der Arena-Tabelle, ein Nachbarschaftskampf immer in `battles`.
- Derselbe Kampf zweimal gesehen wird einmal gespeichert (Schlüssel `[world+battleId]`).

**Abfragen:** wie bei den Kampfzeilen der Nachbarschaft `latest(opponent)` und `list({ opponents?, exceptOpponents?, limit, offset })`, neueste zuerst.

**Persistenz:** Tabelle `arenaBattles` (Dexie Version 17), Schlüssel `[world+battleId]`, Indizes `[world+at]`, `[world+opponent+at]` und `at`.

## ArenaLogEntry (Protokoll)

```ts
interface ArenaLogEntry {
  world: WorldId;
  at: number;                   // time * 1000
  opponent: PlayerId;
  kind: 'attack' | 'defense';
  points: number;               // rankingPointsChange, mit Vorzeichen
}
```

**Regeln**

- Quellen sind die `actions` jeder Übersicht und jedes `addLog`.
- Schlüssel `[world+at+opponent+kind]`: Eine Zeile, die die Übersicht wiederholt oder die nach `addLog` noch einmal in der Übersicht steht, wird einmal gespeichert. Eine bekannte Zeile bleibt, wie sie ist.
- Die Zeilen der Übersicht reichen etwa zwei Tage zurück. Was davor lag und die Toolbox nie gesehen hat, fehlt.

**Abfragen:** `list({ opponents?, exceptOpponents?, kind?, limit, offset })` neueste zuerst; `kind` fehlt, dann beide Arten. `summary({ opponents?, exceptOpponents?, kind? })` ergibt `{ attacks, won, lost, defenses, points }` über genau die Zeilen, durch die `list` mit demselben Filter blättert. Ein Angriff mit mehr als 0 Punkten zählt als gewonnen, jeder andere als verloren. `points` ist die Summe aller Zeilen.

**Persistenz:** Tabelle `arenaLog` (Dexie Version 17), Schlüssel `[world+at+opponent+kind]`, Indizes `[world+at]`, `[world+opponent+at]` und `at`.

## ArenaPoints (eigene Punkte)

```ts
interface ArenaPoints {
  world: WorldId;
  at: number;                   // Zeitpunkt, an dem die Toolbox den Wert sah
  points: number;
}
```

**Regeln**

- Quellen sind `currentPlayer.rankingPoints` der Übersicht und `rankingPoints` jedes `updatePlayer` der Arena. Das Spiel sagt nicht, seit wann der Wert gilt, die Zeit ist die der Toolbox.
- Gespeichert wird nur, wenn der Wert sich gegenüber dem zuletzt gespeicherten der Welt ändert. Das prüft der Service Worker in einer Transaktion. So bleibt die Tabelle klein.

**Abfragen:** `since(from)` alle Werte der Welt ab `from`, älteste zuerst.

**Persistenz:** Tabelle `arenaPoints` (Dexie Version 17), Schlüssel `[world+at]`, Index `at`.

## ArenaOpponent (Gegner im Angebot)

```ts
interface ArenaOpponent {
  opponentId: number;
  player: PlayerId;
  rewardPoints: number;
  difficulty: 'easy' | 'medium' | 'hard';
  era: EraId;
  attackBoost: number;          // defenseArmyBoosts.attackBoost
  defenseBoost: number;         // defenseArmyBoosts.defenseBoost
}
```

Nur im Speicher, je Welt. Die Übersicht, jedes `updateOpponents` und `refreshOpponents` ersetzen die Liste ganz. Abfrage: `current()`. `attackBoost` und `defenseBoost` sind ganze Zahlen ohne Nachkommastellen (gesehen 3413 bis 11991) und gelten als Prozent, in derselben Größenordnung wie `defender_attack_boost` und `defense_boost` der Einheiten im Kampf (gesehen 2152 und 1983); ein Beleg über das Spielfenster steht noch aus. Ein Eintrag ohne Platz, Spieler, Punkte oder bekannte Schwierigkeit wird übersprungen.

## Spieler

Jeder Spieler, den die Gegner oder das Protokoll nennen, geht mit ID, Name und Avatar an `players.applyListed`, außer dem eigenen. Unbekannte werden ohne Beziehung angelegt, bei bekannten ändern sich nur Name und Avatar.

## Events

- `arena.opened {}`: die Übersicht kam, der Spieler hat die Arena geöffnet.
- `arena.opponents {}`: die Gegner im Angebot haben sich geändert.
- `arena.battleRecorded { opponents }` und `arena.logRecorded { opponents }`: einmal je Schreibvorgang, nach dem Schreiben.
- `arena.pointsRecorded {}`: ein geänderter Punktestand ist gespeichert.

## Store und Aufbewahrung

`ctx.arena` (`ArenaStore`, `src/content/stores/arena.ts`) bündelt `battles`, `log`, `points` und `opponents`. Die Aufrufe laufen über RPC im Service Worker (`src/persistence/arena/`).

Aufbewahrung: Es gilt die Einstellung „Kämpfe aufbewahren“ der Nachbarschaft (`pvp.keep`). Beim Start der Session und sobald sich die Einstellung ändert, löscht `arena.prune` ältere Kämpfe, Protokollzeilen und Punkte aller Welten in einer Transaktion, zusammen mit dem Löschen der Nachbarschaft. Der neueste Punktestand einer Welt bleibt auch dann, wenn er älter ist: Er ist der Anfang der Kurve, bis sich die Punkte wieder ändern.

Sicherung: Die drei Tabellen gehören zum Bereich PvP der Sicherung (`BACKUP_TABLES`). Seit Version 4 der Sicherungsdatei. Dateien der Versionen 2 und 3 werden mit leeren Arena-Tabellen gelesen. Beim Zusammenführen kommen nur fehlende Zeilen dazu.
