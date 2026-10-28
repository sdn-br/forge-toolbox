# PvP

## Battle (PvP-Angriffe)

Stand 2026-10-19. Grundlage: ein aufgenommener Autokampf auf de20 (`BattlefieldService.startByBattleType`, Testfall `test/fixtures/pvp-battle.json`) und ein manueller Kampf (ein Zug von Hand, dann Autokampf; `startByBattleType` und `submitMove`, Testfall `test/fixtures/pvp-manual-battle.json`).

```ts
type BattleResult = 'won' | 'lost' | 'surrendered';

interface Battle {
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

**Gemessene Werte** rechnet eine reine Funktion `measuredArmy(battle)` aus den Rohwerten:

| Seite | Angriff | Verteidigung |
|---|---|---|
| Angreifer | `attack_boost` + `military_boost` + `advanced_tactics` | `attacker_defense_boost` + `military_boost` + `advanced_tactics` |
| Verteidiger | `defender_attack_boost` + `fierce_resistance` + `advanced_tactics` | `defense_boost` + `fierce_resistance` + `advanced_tactics` |

Geprüft am 2026-10-19 an der Aufnahme: Beim Angreifer ist `attack_boost` 233 und `attacker_defense_boost` 134, genau die eigenen Gebäude-Boosts aus `BoostService.getAllBoosts` (227 + 6 und 128 + 6). `military_boost` 135 kommt aus den LGs. Beim Verteidiger stimmen `fierce_resistance` 32,5 und `advanced_tactics` 20,5 genau mit der Berechnung aus der besuchten Stadt überein. Gemessen: Angreifer 368 / 269, Verteidiger 406 / 443. Die Einheiten des Verteidigers tragen zusätzlich `attack_boost` 12. Der Wert gehört nicht zur verteidigenden Armee und fließt nicht ein.

Ein Kampf misst nur die verteidigende Armee des Gegners. Seine angreifende Armee zeigt er nie. Die Stadtinformationen zeigen deshalb den gemessenen Wert nur in der Zeile der verteidigenden Armee.

**Abfragen:** `latest(opponent)`, `list({ opponents?, limit, offset })` neueste zuerst, `count(opponents?)`. Die Abfragen laufen über RPC im Service Worker. Der Store hält keine Kämpfe im Speicher, er wartet vor jeder Abfrage nur die eigenen offenen Schreibvorgänge ab.

**Events:** `battle.recorded { opponent: PlayerId }`, einmal je neuem Kampf.

**Persistenz:** Tabelle `battles` (Dexie Version 2), Schlüssel `[world+battleId]`, Indizes `[world+at]`, `[world+opponent+at]` und `at`. Neue Kämpfe einer Spielantwort gehen gesammelt in einem Schreibvorgang an den Service Worker.

**Aufbewahrung:** Einstellung „Kämpfe aufbewahren“: unbegrenzt (Standard), 30, 90, 180 oder 365 Tage. Ältere Kämpfe aller Welten löscht der Service Worker (`battles.prune`) einmal beim Start der Session und sobald sich die Einstellung ändert.

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
