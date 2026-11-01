# PvP

## Battle (PvP-Angriffe)

Stand 2026-11-01. Grundlage: ein aufgenommener Autokampf auf de20 (`BattlefieldService.startByBattleType`, Testfall `test/fixtures/pvp-battle.json`) und ein manueller Kampf (ein Zug von Hand, dann Autokampf; `startByBattleType` und `submitMove`, Testfall `test/fixtures/pvp-manual-battle.json`), dazu ein Autokampf mit der Plünderung zehn Sekunden danach auf de20 (Testfall `test/fixtures/pvp-battle-plunder.json`).

```ts
type BattleResult = 'won' | 'lost' | 'surrendered';

type Battle = FoughtBattle | InferredBattle;   // unterschieden mit isFought(battle)

interface FoughtBattle {
  world: WorldId;
  battleId: number;
  at: number;                   // Kampfbeginn in ms
  opponent: PlayerId;           // der Verteidiger
  result: BattleResult;
  auto: boolean;
  rounds: number;               // gespielte Runden, ab 1
  era: EraId;                   // Zeitalter des Kampfes
  attacker: BattleSide;         // die eigene Armee
  defender: BattleSide;
  plunderAt?: number;           // at der Plünderung, die dieser Sieg erlaubt hat
}

interface InferredBattle {      // „erschlossen“
  world: WorldId;
  battleId: number;             // -at
  at: number;                   // = plunderAt, der späteste Zeitpunkt des Kampfes
  opponent: PlayerId;
  result: 'won';
  inferred: true;
  plunderAt: number;
}

interface BattleSide {
  bonuses: Record<string, number>;   // Rohwerte je Bonus-Typ des Spiels
  units: { unitTypeId: string; startHp: number; endHp: number }[];
}
```

**Regeln**

- Gespeichert werden nur PvP-Kämpfe (`battleType.type === 'pvp'`), in denen der eigene Spieler angreift. Ohne Session wird nichts gespeichert.
- Die Seite einer Einheit steht in `teamFlag`: 1 Angreifer, 2 Verteidiger. `bonuses` sind die Summen je Typ aus der ersten Einheit der Seite. Alle Einheiten einer Seite tragen in der Aufnahme dieselben Boni.
- Die Boni bleiben roh gespeichert. Sie sind unwiederbringlich, und eine spätere Auswertung soll sie neu deuten können.
- Fehlt `currentHitpoints`, ist die Einheit tot (`endHp` 0).
- Ergebnis: `surrenderBit` gesetzt ergibt `surrendered`, `winnerBit` 1 ergibt `won`, ein anderer `winnerBit` ergibt `lost`.
- **Autokampf:** Das Ergebnis steht schon in `startByBattleType` (`isAutoBattle` true). Der Kampf wird sofort gespeichert.
- **Manueller Kampf:** `startByBattleType` kommt ohne `winnerBit` und ohne `isAutoBattle`. Der Kampf wartet dann im Speicher, nur der zuletzt gestartete (der Kampf auf dem Bildschirm). Jede weitere Antwort des `BattlefieldService`, die ein `BattleRealmState` ist (gesehen: `submitMove`, ohne `battleId`), schließt ihn ab, sobald sie `winnerBit` oder `surrenderBit` trägt. Ergebnis, Runden und `endHp` kommen aus diesem Endzustand, die Boni aus dem Start (fehlen sie dort, aus dem Endzustand). Gespeichert wird mit `auto: false`. Ein Zug ohne Ergebnis lässt den Kampf warten. Ein neuer `startByBattleType` ersetzt den wartenden Kampf, auch wenn er kein eigener PvP-Kampf ist. Ein Zug ohne wartenden Kampf wird ignoriert.
- **Runden:** Das Spiel zählt `round` ab 0 und lässt das Feld weg, solange es 0 ist (geprüft an einem manuellen Kampf über vier Runden: Feld fehlt in den ersten 7 Zügen, dann 1, 2, 3). Gespeichert wird `round` + 1. Aufgeben (`BattlefieldService.surrender`) liefert einen `BattleRealmState` mit `surrenderBit` und ohne `winnerBit`.
- Geprüft am 2026-10-19 an der Aufnahme des manuellen Kampfes: genau ein `submitMove`, mit `winnerBit` 1 und `round` 1. Die Boni aller Einheiten sind dort dieselben wie im Start. Toten Einheiten fehlt `currentHitpoints` auch im Endzustand.
- Ein Kampf, der wartet, geht bei einem Neuladen verloren.
- Derselbe Kampf zweimal gesehen wird einmal gespeichert (Schlüssel `[world+battleId]`).
- Kämpfe aus der alten Toolbox haben keine Kampf-ID und bekommen die negative Zeit (siehe [Altdaten-Import](../features/sicherung.md#altdaten-import)).

**Kampf und Plünderung** (Nutzer, 2026-11-01): Das Spiel sagt nicht, welcher Kampf eine Plünderung erlaubt hat. Ein Spieler lässt sich einmal in 24 Stunden angreifen, und geplündert werden kann bis 24 Stunden nach einem gewonnenen Kampf. Daraus folgt die Zuordnung:

- Eine Plünderung gehört zum letzten gewonnenen Kampf gegen denselben Gegner in den 24 Stunden vor ihr (`plünderung.at - 24 h <= kampf.at <= plünderung.at`, genau 24 Stunden zählen noch). Verlorene und aufgegebene Kämpfe, Kämpfe gegen andere Gegner und Kämpfe nach der Plünderung zählen nie. Eine abgewehrte Plünderung braucht genauso einen gewonnenen Kampf.
- Die Plünderungen werden der Zeit nach zugeordnet, die älteste zuerst. Ein Kampf, den eine frühere Plünderung schon hat, ist vergeben. Jede Plünderung hat genau einen Kampf, jeder Kampf höchstens eine Plünderung.
- Der Kampf trägt die Zeit seiner Plünderung (`plunderAt`), der Schlüssel der Plünderung ist `[world, opponent, plunderAt]`.
- **Erschlossener Kampf:** Findet eine Plünderung keinen gespeicherten Kampf (alte Daten, Kampf vor Beginn der Aufzeichnung), wird ein erschlossener Kampf gespeichert: gewonnen, sicher stattgefunden, Zeit ist die der Plünderung als obere Grenze („spätestens <Zeit>“), ohne Einheiten und Werte. Die Kampf-ID ist die negative Zeit wie bei den Kämpfen der alten Toolbox. Kommt später ein passender Kampf, ersetzt er ihn. Andere erschlossene Kämpfe gibt es nicht.
- Im Zweifel entsteht ein erschlossener Kampf, nie eine Zuordnung außerhalb der Regel.
- Die Regel steht nur in der reinen Funktion `linkedBattles` (`src/persistence/pvp-link.ts`). `relink(tables, world, opponents)` liest je Gegner beide Tabellen, wendet sie an und schreibt nur, was sich ändert. Ein zweiter Lauf schreibt nichts. Es läuft in der Transaktion des Aufrufers: beim Schreiben von Kämpfen und Plünderungen, beim Import und im Upgrade auf Dexie Version 13. Die Reihenfolge, in der Kampf und Plünderung ankommen, ändert das Ergebnis nicht. Ein Kampf, den das Spiel noch einmal schickt, behält seine Plünderung.
- Anzeige: Im Reiter „Kämpfe“ ist ein erschlossener Kampf eine Zeile mit Gegner, „spätestens <Zeit>“, „gewonnen“ und „erschlossen“ statt Runden, ohne Armeewerte. Aufgeklappt zeigt er nur seine Plünderung und eine gedämpfte Zeile, dass der Kampf selbst nicht aufgezeichnet ist (seit 2026-11-01, vorher nicht aufklappbar). In der Box „Besuchte Stadt“ kann der letzte Kampf ein erschlossener sein, dann ohne Details. Die gemessene verteidigende Armee kommt immer vom letzten geführten Kampf (`latestFought`), ein erschlossener verdeckt sie nie.

**Gemessene Werte** rechnet eine reine Funktion `measuredArmy(battle)` aus den Rohwerten:

| Seite | Angriff | Verteidigung |
|---|---|---|
| Angreifer | `attack_boost` + `military_boost` + `advanced_tactics` | `attacker_defense_boost` + `military_boost` + `advanced_tactics` |
| Verteidiger | `defender_attack_boost` + `fierce_resistance` + `advanced_tactics` | `defense_boost` + `fierce_resistance` + `advanced_tactics` |

Geprüft am 2026-10-19 an der Aufnahme: Beim Angreifer ist `attack_boost` 233 und `attacker_defense_boost` 134, genau die eigenen Gebäude-Boosts aus `BoostService.getAllBoosts` (227 + 6 und 128 + 6). `military_boost` 135 kommt aus den LGs. Beim Verteidiger stimmen `fierce_resistance` 32,5 und `advanced_tactics` 20,5 genau mit der Berechnung aus der besuchten Stadt überein. Gemessen: Angreifer 368 / 269, Verteidiger 406 / 443. Die Einheiten des Verteidigers tragen zusätzlich `attack_boost` 12. Der Wert gehört nicht zur verteidigenden Armee und fließt nicht ein.

Ein Kampf misst nur die verteidigende Armee des Gegners. Seine angreifende Armee zeigt er nie. Die Box „Besuchte Stadt“ zeigt deshalb den gemessenen Wert nur in der Zeile der verteidigenden Armee.

**Abfragen:** `latest(opponent)` (auch ein erschlossener), `latestFought(opponent)` (nur geführte Kämpfe), `list({ opponents?, withPlunder?, limit, offset })` neueste zuerst, auch über mehrere Gegner geblättert, jeder Kampf mit seiner Plünderung (`plunder`, über den Schlüssel gelesen); `withPlunder` nur Kämpfe mit Plünderung. `summary({ opponents?, withPlunder? })` ergibt `{ battles, won, plunders, repelled, fp }` über genau die Kämpfe, durch die `list` mit demselben Filter blättert: erschlossene zählen als gewonnen, `plunders` sind die erfolgreichen, `fp` die Forge-Punkte der erfolgreichen (wie `plunders.totals`). Der Reiter „Kämpfe“ liest mit `list` nur einen Ausschnitt um die sichtbaren Zeilen (`offset`, `limit`), die Zahl aller Zeilen und die Summenzeile kommen aus `summary` mit demselben Filter. Das Namensfeld und die Filter nach PvP-Marke werden zu `opponents`, der Filter „nur Kämpfe mit Plünderung“ zu `withPlunder`. `withPlunder` und `summary` lesen ohne Index auf `plunderAt` (bekannte Schuld: erst wenn das Öffnen des Reiters messbar über eine Sekunde braucht, ein Index in einer späteren Dexie-Version). Die Abfragen laufen über RPC im Service Worker. Der Store hält keine Kämpfe im Speicher, er wartet vor jeder Abfrage nur die eigenen offenen Schreibvorgänge ab.

**Events:** `battle.recorded { opponents: PlayerId[] }`, einmal je Schreibvorgang, nach dem Schreiben. Eine Plünderung kann erschlossene Kämpfe anlegen oder löschen, darum laden der Reiter „Kämpfe“ und der letzte Kampf der Box „Besuchte Stadt“ auch bei `plunder.recorded` neu.

**Persistenz:** Tabelle `battles` (Dexie Version 2), Schlüssel `[world+battleId]`, Indizes `[world+at]`, `[world+opponent+at]` und `at`. Neue Kämpfe einer Spielantwort gehen gesammelt in einem Schreibvorgang an den Service Worker. `battles.put` und `plunders.put` schreiben ihre Zeilen und ordnen die berührten Gegner neu zu, in einer `rw`-Transaktion über beide Tabellen. Dexie Version 13 behält das Schema von `battles` und `plunders` und ordnet im Upgrade jeden Gegner jeder Welt mit Plünderungen zu. Eine Datenbank ohne Plünderungen bleibt unverändert.

**Aufbewahrung:** Einstellung „Kämpfe aufbewahren“: unbegrenzt (Standard), 30, 90, 180 oder 365 Tage. Ältere Kämpfe aller Welten löscht der Service Worker (`battles.prune`) einmal beim Start der Session und sobald sich die Einstellung ändert. Ein älterer Kampf bleibt, solange seine Plünderung bleibt (`plunderAt` nicht älter als die Grenze). Plünderungen werden mit derselben Grenze gelöscht, so behält jede verbleibende Plünderung ihren Kampf.

**Spieler:** Ein Kampf verweist auf `opponent`. Eine Bereinigung der Spieler gibt es noch nicht. Kommt sie, muss sie Spieler behalten, auf die ein Kampf verweist. Den Namen des Gegners liefert meist das `OtherPlayerService.updatePlayer`, das in derselben Antwort wie der Kampf kommt.

## CityShield (Schilde)

Stand 2026-10-21. **Format laut alter Toolbox, nicht selbst gesehen.** Quelle: `OtherPlayerService.getCityProtections`, `responseData` ist eine Liste von `{ playerId, expireTime }`. `expireTime` ist in Unix-Sekunden, `-1` heißt, der Spieler kann gar nicht angegriffen werden. Vermutung: Die Liste kommt beim Start, wenn ein Nachbar schon einen Schild hat, und über den Websocket, wenn ein Nachbar einen Schild aktiviert (24, 48 oder 72 Stunden aus dem Laden der Freundesschenke). Die Ingestion behandelt `json` und `ws` gleich.

```ts
interface CityShield {
  world: WorldId;
  player: PlayerId;
  expiresAt: number;            // expireTime * 1000
}
```

**Regeln**

- Nur Einträge mit numerischer `playerId` und `expireTime > 0` zählen. `-1` und Einträge in fremdem Format werden übersprungen.
- Ein neuer Eintrag ersetzt den Schild des Spielers. Ein Start ohne Liste löscht nichts.
- Abgelaufene Schilde werden beim Lesen ignoriert und einmal beim Start der Session gelöscht (`shields.prune`).
- Bis Format und Auslöser im Spiel bestätigt sind, schreibt die Toolbox jede `getCityProtections`-Nachricht roh in die Konsole (`[Forge Toolbox] getCityProtections (format unconfirmed)`).

**Abfragen:** `active(player)`. **Events:** `shield.recorded { players: PlayerId[] }`.

**Persistenz:** Tabelle `cityShields` (Dexie Version 8), Schlüssel `[world+player]`, Index `expiresAt`.
