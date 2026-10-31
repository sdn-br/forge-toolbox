# Erweiterungen und Bewertung

## Erweiterungen (abgeleitet)

Reine Funktionen in `src/content/domain/expansions.ts`. Referenz eigene Stadt (Aufnahme 2026-10-21): 324 Blöcke im Gitter, 190 freigeschaltet, 49 gesperrt, 85 frei, davon 32 angrenzend, `tilesets` mit genau 85 Einträgen (23 `tileset_reward`, 9 `raidMedals`, 53 `tileset_premium`).

- **Gesetzt:** freigeschaltete Felder ÷ 16 − 16 (der Startbereich 16 × 16 sind 16 Blöcke).
- **Freie Blöcke:** Block des Gitters, dessen linkes oberes Feld weder in `unlocked_areas` noch in `blocked_areas` liegt. „Jetzt setzbar“, wenn er eine Kante mit einem freigeschalteten Block teilt, sonst „später“. Bestätigt im Baumodus (2026-10-21): dunkel markiert das Spiel alle Flächen, auf die theoretisch eine Erweiterung passt, eingezäunt nur die, die über eine Seitenkante an die Stadt grenzen und sich deshalb jetzt setzen lassen.
- **Arten wie im Spiel („Erweiterungen kaufen“):** Diamant-Erweiterung (`tileset_premium`, Preis `premium`), Belohnungs-Erweiterung (`tileset_reward`), Sieg-Erweiterung (Typ unbekannt, in unseren Daten keine offen), Quanten-Erweiterung (`raidMedals`, Preis `guild_raids_medals`, die Quanten-Medaillen). Belohnungs-Erweiterungen gibt es nur als Belohnung: Ihre Einträge nennen Münzen und Diamanten, das Spiel bietet aber keine zum Kauf an (Screenshot 2026-10-21, 23 offen, „keine platzierbaren mehr“). Kaufbar zählen Diamant- und Quanten-Erweiterungen. Gezählt werden nur Einträge eines erreichten Zeitalters, günstigste zuerst, nacheinander, solange die aktuellen Ressourcen reichen. „Nächste“ ist der Preis des ersten Eintrags, der nicht mehr reicht. Weitere ab dem frühesten noch nicht erreichten `min_era`. Diamanten zählen auf Nutzerwunsch als Bezahlweg (Anzeige, kein Kauf). Geprüft am Kauf-Fenster: Quanten „Verfügbar: 9“, nächste 600K, passt zur Preisleiter.

- **Belohnungs-Erweiterungen im Detail:** „{platzierbar} platzierbar, {offen} offen ({aus Forschung} aus Forschung, nächste: {Technologie}; {Rest} von der Kontinentkarte)“. *Platzierbar* ist die Ressource `expansions` (gewonnen, noch nicht gesetzt), immer angezeigt, auch 0, sobald die Ressourcen bekannt sind; eine eigene Zeile „Ungesetzt“ gibt es nicht mehr. *Offen* ist die Zahl der `tileset_reward`-Einträge. *Aus Forschung* ist die Summe der Hauptstadt-Erweiterungen (`type: 'expansion'`, `subType: 'main'`) aller Technologien, die nicht in `unlockedNodes` stehen; *nächste* ist die erste davon in der Reihenfolge der Metadatei. *Von der Kontinentkarte* ist der Rest `offen − aus Forschung`, nur wenn er größer als 0 ist. Fehlt die Forschungs-Metadatei oder der Fortschritt, entfällt die Klammer.

**Annahme Kontinentkarte:** Was die Forschung nicht erklärt, kommt aus den Provinzen der Kontinentkarte. Deren Belohnungen stehen noch nicht in unseren Daten. Ist der Rest negativ, stimmt die Annahme nicht, dann zeigt die Zeile nur den Forschungsteil. Referenz eigene Stadt (2026-10-21): 23 offen, 0 platzierbar, 14 aus Forschung (erste: „Mars-Vorschriften“, SpaceAgeMars), also 9 von der Kontinentkarte.

**Annahmen:** Jeder Eintrag in `tilesets` ist eine offene Erweiterung, `available: true` sagt nichts. Der Preis steht unter `requirements.cost.resources` (geprüft an einer Aufnahme). Gesperrte Blöcke sind nicht kaufbar (der Baumodus markiert sie nicht).

**Woher die Definitionen kommen (geprüft am 2026-10-19 auf de20):** Das Spiel lädt zuerst `building_entity_lookup` (Liste aller Gebäude mit URL und Hash). Danach lädt es einzeln per XHR nur die Definitionen, die es braucht: beim Start rund 110 für die eigene Stadt, beim Besuch einer Stadt die noch fehlenden (beim ersten Besuch 18). Der Helfer lädt dagegen alle rund 2.900 selbst vom CDN.

Daraus folgt:

- Der Catalog liest nur mit, was das Spiel lädt. Eigene CDN-Abrufe braucht es nicht.
- Definitionen werden nicht gespeichert. Das Spiel lädt in jeder Sitzung alle, die es braucht, erneut.
- Beim Stadtbesuch kommen fehlende Definitionen kurz nach `visitPlayer`. Der Catalog meldet `catalog.updated { defs }`, und wer eine Stadt bewertet, rechnet dann neu. Bis dahin markiert `CityAssessment` die Bewertung als unvollständig.

## Abgeleitete Werte: CityAssessment

Eine reine Funktion, kein Store:

```ts
function assessCity(city: City, catalog: Catalog): CityAssessment;

interface CityAssessment {
  army: {
    attacker: { attack: number; defense: number };
    defender: { attack: number; defense: number };
  };
  plunderRepel: number;
  plunderable: { building: number; name: string; resources: Record<string, number> }[];  // nur fertige
  missingDefs: BuildingDefId[];   // noch nicht geladen, Bewertung unvollständig
}
```

Sabotage ruft sie nach `city.visited` auf und baut daraus sein ViewModel. Andere Features (Spielerprofil, PvP-Angriffe) können sie ebenso nutzen, ohne Sabotage zu kennen.

## Regeln der Bewertung (geprüft am 2026-10-19)

Geprüft an der eigenen Stadt gegen `BoostService.getAllBoosts`, das die Boosts fertig berechnet und pro Gebäude mit Quelle liefert (`building`, `building_set_adjacency`, `building_chain_links`, `castle_system`, `friends_tavern_customization`). Gebäude, Sets und Ketten stimmen exakt überein, Testfall `test/fixtures/own-city.json`.

- **Zeitalter eines Gebäudes:** Klassische Mehrzeitalter-Gebäude behalten das Zeitalter, in dem sie gebaut oder zuletzt verbessert wurden. Es steht als `level` (Index in der Reihenfolge von `research_eras`) am Gebäude. Generische Gebäude und LGs zählen mit dem Zeitalter der Stadt.
- **Sets:** Stufe n gilt, wenn das Gebäude an n verschiedene andere Gebäude desselben Sets mit einer Kante grenzt. Die Stufen zählen zusammen.
- **Ketten:** Vom Startgebäude aus über `linkPositions` ablaufen. Jedes erreichte Glied gibt seinen Bonus. Das Spiel bucht die Summe auf das Startgebäude.
- **Gebäude außerhalb des Gitters:** zählen mit, auch wenn die Stadtkarte sie ausblendet (`offGrid` am Gebäude, gesetzt in `convert.ts`). Das Spiel rechnet ihre Boosts unabhängig vom Standort. Ob eines davon plünderbar ist, bleibt ohne Aufnahme offen.
- **LG-Boni:** `military_boost` für die angreifende, `fierce_resistance` für die verteidigende Armee, `advanced_tactics` für beide. Gleiche Zuordnung wie im Forge Hammer.
- **Nicht bekannt für fremde Städte:** Burgsystem-Bonus (bei der eigenen Stadt +6 auf beide Armeen) und Verbündete. Die alte Toolbox hat offenbar den eigenen Burgsystem-Bonus auf fremde Städte gerechnet.
- **Echte Werte aus dem Kampf:** `BattlefieldService.startByBattleType` liefert je Einheit die tatsächlichen Boni beider Seiten (`attack_boost`, `attacker_defense_boost`, `defender_attack_boost`, `defense_boost`, dazu die LG-Typen). Beim Test gegen eine fremde Stadt lag die Berechnung rund 30 (Angriff) und 41 (Verteidigung) unter dem Spiel, vermutlich Burgsystem und Verbündete. Berechnete Werte vor einem Kampf sind daher eine Untergrenze. Die gemessenen Werte speichert der Battle-Store (siehe unten).
- **Zeiten:** In fremden Städten verbirgt das Spiel alle Zeiten (`next_state_transition_at` und `_in` = 2147483647). Gelistet wird deshalb nur, was fertig ist (`ProductionFinishedState`). Einen Abschnitt „In Produktion“ gibt es nicht, ohne Zeit sagt er nichts.

### Plünderbarkeit (geprüft am 2026-10-19)

Grundlage: Besuch einer Stadt auf de10 mit allen Gebäude-Definitionen (628 Gebäude), Besuch auf de20, je ein echtes Plündern (`OtherPlayerService.plunderById`) und Angaben eines erfahrenen Spielers.

Ein Gebäude steht unter „Jetzt plünderbar“, wenn alles zutrifft:

1. **Die Definition erlaubt es.** Klassische Definitionen: Typ `production`, `goods`, `residential` oder `clan_power_production`, keine der Fähigkeiten `AddResourcesToGuildTreasuryAbility`, `RandomChestRewardAbility`, `NotPlunderableAbility`, nur auf dem Hauptgitter. Generische Definitionen (`GenericCityEntity`): nur, wenn das Gebäude motivierbar ist (`socialInteraction` mit `interactionType: 'motivate'` oder `MotivatableAbility`).
2. **Die Produktion ist fertig** (`ProductionFinishedState`).
3. **Das Gebäude ist nicht motiviert** (`is_motivated`, in fremden Städten `socialInteractionId: 'motivate'`).
4. **Es ist etwas zu holen:** Der Besuch schickt ein Produkt mit mindestens einer Ressource.

Woher das Produkt kommt:

- Klassische Gebäude schicken es im Besuch als `current_product`. Alle 52 fertigen Wohnhäuser im de10-Besuch tun das.
- Fertige generische Gebäude schickt der Besuch oft ohne Produkt. Dann gibt es nichts zu plündern, geprüft im Spiel am Keltischen Goldschmied St. 5, am Handelsposten St. 8 und an Atem des Drachen St. 9 derselben Stadt (alle fertig, nicht motiviert, ohne Produkt, Plünderung noch frei, im Spiel nichts zu holen). Das inoffizielle Wiki nennt Yggdrasil unmotiviert plünderbar, was dem widerspricht, vermutlich veraltet. Die alte Toolbox listet solche Gebäude ebenfalls nicht.

Belege:

- **Motivierbarkeit:** Laut Spieler sind nicht motivierbare Spezialgebäude nie plünderbar, schon ab Stufe 1: Siegesturm, Wunschbrunnen, Druidentempel, Piratenversteck, Goldenes Orrery. In der de10-Aufnahme sind das genau die 6 generischen Produktionsgebäude ohne `motivate`. Alle 18 motivierbaren (etwa Handelsposten, Yggdrasil, Adlerberg) sind unmotiviert plünderbar. Ein Kennzeichen im Bauteil `flags` (Wert 23 statt 19) trifft nur Siegesturm und Wunschbrunnen und reicht deshalb nicht.
- **Medaillen schützen nicht:** Eine frühere Regel schloss Gebäude mit Medaillen in ihrer Stufe aus. Widerlegt am 2026-10-20: Ein Mondtor (`R_MultiAge_PatrickBonusSet20b`) St. 6 wurde mit 5.100 Münzen, 2 FP und 17 Medaillen geplündert. Laut Spieler sind viele Gebäude mit Medaillen trotzdem geschützt, der Grund ist aber eine andere, noch unbekannte Eigenschaft des Gebäudes. Bis sie gefunden ist, zeigt die Box solche Gebäude an.
- **Handelsposten:** Seine Definition gleicht der der Zeitlosen Kreuzung (Flags 19, `motivate`, Produkt ohne `onlyWhenMotivated`). Im de10-Besuch war er motiviert, das allein schließt ihn aus. Laut Spieler ist er unmotiviert plünderbar.
- **Plünderbar:** Wohnhaus mit 610 Münzen, geplündert 1.220 (doppelte Beute, de10). Domizil mit 110 Münzen, geplündert 110 (de20). Rosarium (klassisch, Typ `production`) und Zeitlose Kreuzung laut Spieler.
- **Ergebnis de10-Besuch:** vorher 52 Einträge (50 fertige Wohnhäuser, dazu Siegesturm St. 1 und St. 2 unter „In Produktion“), danach 50, nur die fertigen Wohnhäuser.
