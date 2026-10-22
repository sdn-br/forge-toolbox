# Ressourcen und Inventar

## Ressourcen

`ResourceService.getPlayerResourceBag` kommt mit den Startdaten. Format (geprüft 2026-10-21): `{ type, resources: { resources: { money, premium, expansions, guild_raids_medals, … } } }`, die Mengen stecken also eine Ebene tiefer. Der `ResourceStore` hält den Beutel im Speicher (nicht persistiert) und meldet `resources.changed`. In der Aufnahme ist `type` ein Enum `{ __enum__: 'ResourceBagType', value: 'PlayerMain' }`. Nur Beutel ohne Typ oder mit `PlayerMain` zählen, andere Typen gehören zu anderen Beständen und werden übergangen.

**Updates:** Alle können als normale Antwort oder über den Websocket kommen, ein Websocket-Rahmen kann mehrere Nachrichten bündeln.

- `ResourceService.getPlayerResourceBag` später im Spiel, **aufgezeichnet 2026-10-21:** wie beim Start (`PlayerMain`), etwa in der Antwort auf eine eigene LG-Einzahlung (dort `strategy_points` 0) und nach Quest-Aktionen und Ereignissen der Karte. Ersetzt den Bestand.
- `ResourceService.getPlayerResources`, **unter Vorbehalt, nicht aufgezeichnet:** `responseData.resources` ersetzt den ganzen Bestand.
- `OtherPlayerService.newEvent`, **unter Vorbehalt, nicht aufgezeichnet:** mit `type: trade_accepted`: Ein anderer Spieler hat ein eigenes Handelsangebot angenommen, `need.value` des Guts `need.good_id` kommt zum Bestand dazu. Nur, wenn der Bestand schon bekannt ist.

## Inventar

Stand 2026-10-21. `InventoryService.getItems` kommt mit den Startdaten, eine Liste aller Gegenstände (in der Aufnahme 298). Je Eintrag (gesehen): `id` (Stapel im Inventar), `name`, `description`, `inStock`, `itemAssetName`, `item` (die Nutzlast, ihr `__class__` sagt, was der Gegenstand tut) und Felder für Tausch und Sortierung. Gesehene Klassen: `BuildingItemPayload`, `SelectionKitPayload`, `UpgradeKitPayload`, `FragmentItemPayload`, `BoostItemPayload`, `SpeedupPayload`, `RewardItemPayload`, `ForgePointPackagePayload`, dazu einzelne Kits.

```ts
interface InventoryItem {
  id: number;
  name: string;
  inStock: number;
  gameClass: string;            // Klasse der Nutzlast, z.B. 'ForgePointPackagePayload'
  asset?: string;               // itemAssetName
  payload:
    | { kind: 'forgePoints'; gain: number }                        // item.resource_package.gain
    | { kind: 'building'; def: BuildingDefId; level?: number }      // item.cityEntityId, item.level
    | { kind: 'boost'; boostType: string; value: number; duration?: number }
    | { kind: 'other' };        // alle übrigen Klassen, bis ein Feature sie braucht
}
```

Der `InventoryStore` hält die Liste im Speicher (nicht persistiert, kommt bei jedem Start neu) und meldet `inventory.changed`. Abfragen: `items()`, `item(id)`, `forgePointPackages()` (Summe des Spiels oder gerechnet, siehe unten), `computedForgePointPackages()`.

**FP-Pakete:** Gegenstände mit `ForgePointPackagePayload`. Ihr Wert ist `inStock × gain`. Referenz (Aufnahme 2026-10-21): 9.931 × 10 + 401 × 5 + 3.569 × 2 = 108.453 FP. Der LG-Rechner zählt sie zu den verfügbaren FP, weil das Spiel beim Einzahlen Pakete selbst öffnet.

**Updates:** Alle können als normale Antwort oder über den Websocket kommen, ein Websocket-Rahmen kann mehrere Nachrichten bündeln.

- `getItems` (ganze Liste) ersetzt das Inventar.
- `updateItem`, **aufgezeichnet 2026-10-21:** `{ id, amount, __class__: 'InventoryItemUpdate' }`, `amount` ist der neue Bestand, keine Differenz. Bei einer eigenen LG-Einzahlung von 301 FP kamen zwei getrennte Nachrichten in derselben Antwort (10er-Pakete 9.931 → 9.906, 5er-Pakete 401 → 400). Eine Liste solcher Einträge wird ebenfalls gelesen (unter Vorbehalt).
- `GreatBuildingsService.getAvailablePackageForgePoints`, **aufgezeichnet 2026-10-21:** `[108198]`, die Summe der FP in Paketen, die das Spiel selbst rechnet. Sie stimmte mit `inStock × gain` überein. Entscheidung: Der Store nimmt diese Summe, solange sich danach nichts am Inventar geändert hat, sonst rechnet er selbst. So zählt im Zweifel der Wert des Spiels, und eine spätere Änderung ohne neue Summe macht ihn nicht falsch. Kennt der Store noch keine Liste (kein Start in der Sitzung), reicht die Summe allein für die verfügbaren FP.

**Unter Vorbehalt, nicht aufgezeichnet:**

- `getItemsByType`: ganze Gegenstände eines Typs, sie werden nach `id` eingefügt oder ersetzt. Gegenstände anderer Typen bleiben.
- `getItem`: ein ganzer Gegenstand, eingefügt oder ersetzt. So kommen neue Gegenstände an, etwa FP-Pakete aus einem gelevelten LG, Quest- oder Kartenbelohnungen.
- `getItemAmount`: `responseData` ist das Paar `[id, Menge]`, die Menge ist der neue Bestand.
- Unbekannte `id` bei `getItemAmount` und `updateItem` werden übergangen, bis die nächste ganze Liste kommt.
- `inventory.changed` kommt einmal je Spielantwort oder Websocket-Rahmen und nur, wenn sich etwas geändert hat. Das Öffnen von Paketen schickt mehrere Updates hintereinander.
