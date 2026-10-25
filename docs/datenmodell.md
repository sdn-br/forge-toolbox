# Datenmodell

Stand 2026-10-19. Entwurf für Phase 1. Grundlage: Aufnahme echter Spielantworten auf de20 (`StartupService.getData`, `OtherPlayerService.getSocialList`, `OtherPlayerService.visitPlayer`) und die Daten, die Sabotage heute braucht.

## Grundsätze

1. **Fakten speichern, Abgeleitetes berechnen.** Stores halten, was das Spiel gemeldet hat, in eigenem Format. Werte wie Angriff und Verteidigung einer Stadt oder plünderbare Produktionen rechnet eine reine Funktion daraus aus. So bleiben Stores schlank, und die Rechnung ist mit Fixtures testbar.
2. **Eigene Namen, eigene Typen.** Kein Feld heißt wie im Spielformat, nur weil es dort so heißt (`clan_id` wird `guildId`). Zustände sind getrennte Varianten statt einer Sammlung optionaler Felder.
3. **Jeder Datensatz weiß, woher und von wann er ist** (`source`, `seenAt`). Wer zuletzt etwas gemeldet hat, gewinnt, aber nur für die Felder, die er mitbringt.
4. **Ein Store, ein Besitzer.** Nur der Store ändert seine Daten. Andere lesen über Abfragen oder hören auf seine Events.

## Identität

```ts
type WorldId = string & { readonly brand: 'WorldId' };     // "de20"
type PlayerId = number & { readonly brand: 'PlayerId' };
type GuildId = number & { readonly brand: 'GuildId' };
type EraId = string & { readonly brand: 'EraId' };          // "ColonialAge"
type BuildingDefId = string & { readonly brand: 'BuildingDefId' }; // "R_ColonialAge_Residential1"
```

Alle Daten gehören zu einer Welt. Persistente Schlüssel sind immer `[world, id]`. Die Marken (`brand`) verhindern, dass eine Spieler-ID versehentlich als Gilden-ID durchgeht.

Der eigene Spieler ist die **Session**: Welt, eigene Spieler-ID, Name, Gilde, Zeitalter. Sie kommt aus `StartupService.getData` (`user_data`) und ist die Voraussetzung für alles andere.

## Domänen

Je Domäne eine Datei. Für ein Feature nur die Dateien lesen, die es berührt.

- [Player](datenmodell/player.md): Spieler, Gilde, Beziehungen, Angriffs-Zeitgeber
- [City](datenmodell/city.md): eigene und besuchte Stadt, Gebäude, Stadtplan-Daten
- [Catalog](datenmodell/catalog.md): statische Spieldaten, Gebäude-Definitionen, Namen
- [Ressourcen und Inventar](datenmodell/ressourcen.md): Ressourcenbeutel, Inventar, FP-Pakete
- [Erweiterungen und Bewertung](datenmodell/bewertung.md): abgeleitete Werte (Erweiterungen, CityAssessment, Plünderbarkeit)
- [PvP](datenmodell/pvp.md): Kämpfe, Plünderungen, Angriffe auf mich, Schilde
- [Great Buildings](datenmodell/great-buildings.md): LG-Bau, Rangliste, Rechnung je Platz, Einzahlung

## Zuordnung Spielantwort → Store

| Spielantwort | Store | Wirkung |
|---|---|---|
| `StartupService.getData` | Session, City, Catalog | Session anlegen, eigene Stadt setzen, Güter laden |
| `OtherPlayerService.getSocialList` | Player | alle Spieler aktualisieren, Beziehungen neu setzen, Angriffs-Zeitgeber der Nachbarn setzen |
| `OtherPlayerService.visitPlayer` | Player, City | Spieler aktualisieren, besuchte Stadt setzen |
| `OtherPlayerService.updatePlayer` | Player | Spieler aktualisieren, Angriffs-Zeitgeber setzen |
| `OtherPlayerService.getCityProtections` (laut alter Toolbox) | CityShield | Schilde ersetzen |
| `FriendService.acceptInvitation` | Player | neuen Freund aktualisieren, `friend` setzen |
| `FriendService.deleteFriend` (laut alter Toolbox) | Player | `friend` wegnehmen |
| `BattlefieldService.startByBattleType` | Battle | eigenen PvP-Angriff speichern, manuellen Kampf bis zum Ende vormerken |
| `BattlefieldService.*` mit `BattleRealmState` (gesehen: `submitMove`) | Battle | vorgemerkten manuellen Kampf mit dem Ergebnis speichern |
| `CityMapService.updateEntity`, `reset` | City | eigene oder besuchte Stadt je nach Spieler-ID |
| `CityMapService.placeBuilding`, `removeBuilding`, `moveEntity` | City | eigene Stadt ändern |
| Metadaten `building_entity_lookup` und `building_entity_<id>` | Catalog | Gebäude-Definitionen |
| `OtherPlayerService.getOtherPlayerCityMapEntity` | GreatBuilding | fremdes LG vormerken, bis die Konstruktion kommt |
| `GreatBuildingsService.getConstruction` | GreatBuilding | Konstruktion öffnen, fremdes LG speichern |
| `GreatBuildingsService.getConstructionRanking` | GreatBuilding | vergangene Stufe zeigen oder laufende Rangliste erneuern |
| `GreatBuildingsService.contributeForgePoints` | GreatBuilding | am Ende der Antwort: neue Rangliste, Gebäude aus dem `reset` derselben Antwort |
| `CityMapService.reset`, `updateEntity` mit dem offenen fremden LG | GreatBuilding (und City) | Stand des LGs, bei einer Einzahlung mit ihr zusammen |
| `GreatBuildingsService.getAvailablePackageForgePoints` | Inventory | Summe der FP in Paketen laut Spiel |
| `OtherPlayerService.newEvent` mit `great_building_contribution` (nicht aufgezeichnet) | GreatBuilding | offene Konstruktion als gelevelt markieren |
| `InventoryService.getGreatBuildings`, `GreatBuildingsService.getOtherPlayerOverview` | Catalog | Namen der LGs |
| `BonusService.getLimitedBonuses` | GreatBuilding | befristete Boni für den Arche-Bonus |
| `InventoryService.getItems` | Inventory | Inventar ersetzen (alle Gegenstände) |
| `InventoryService.getItemsByType`, `getItem` (nicht aufgezeichnet) | Inventory | Gegenstände einfügen oder ersetzen |
| `InventoryService.updateItem` | Inventory | neuen Bestand bekannter Gegenstände setzen |
| `InventoryService.getItemAmount` (nicht aufgezeichnet) | Inventory | neuen Bestand bekannter Gegenstände setzen |
| `ResourceService.getPlayerResourceBag` (nur `PlayerMain`) | Resource | Bestand ersetzen |
| `ResourceService.getPlayerResources` (nicht aufgezeichnet) | Resource | Bestand ersetzen |
| `OtherPlayerService.newEvent` mit `trade_accepted` (nicht aufgezeichnet) | Resource | angenommenes Handelsangebot: Gut dazuzählen |

## Offene Punkte

- Besuchte Städte bleiben vorerst nur im Speicher. Sobald ein Feature einen Verlauf braucht (etwa wann ein Nachbar wieder plünderbar war), bekommen sie eine Tabelle.
- Genaue Namen der Spiel-Methoden für Bauen, Abreißen und Verschieben aus einer Aufnahme bestätigen.
- LG: das Level-up-Ereignis `great_building_contribution` aufnehmen und Format bestätigen.
- Inventar und Ressourcen: Die Updates `InventoryService.getItemsByType`, `getItem`, `getItemAmount`, `ResourceService.getPlayerResources` und `trade_accepted` sind unter Vorbehalt umgesetzt. Ihr Format mit einer Aufnahme bestätigen, etwa einer Belohnung mit neuen Paketen.
- LG: FP aus Quests (Zeile im LG-Rechner) braucht Quest-Daten, die die Ingestion noch nicht liest (`QuestService.getUpdates`).
