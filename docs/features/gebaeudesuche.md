# Gebäudesuche

Stand 2026-10-25. Altes Modul `citysearch` der alten Toolbox, hier nur als Idee übernommen. Die Pfeile im Spiel sind die [Markierungspfeile](stadtplan.md) des Stadtplans.

**Zweck:** Gebäude der eigenen Stadt nach Namen finden und auswählen, ohne den Stadtplan zu öffnen. Die ausgewählten Gebäude bekommen goldene Pfeile direkt im Spielbild.

## Eine Auswahl der eigenen Stadt

Gebäudesuche, Suche im Stadtplan und Klicks im [Stadtplan](stadtplan.md) sind Ansichten auf dieselbe Sache: **eine Auswahl von Gebäuden der eigenen Stadt** (Nutzer, 2026-10-25). Die Pfeile im Spiel zeigen genau diese Auswahl. Sie löst das frühere Modell ab, in dem jede Quelle die Pfeile der anderen ersetzte.

- **Gemeinsamer Zustand** (`src/content/core/selection.ts`, `ctx.selection`): hält die ausgewählten Gebäude der eigenen Stadt und meldet jede Änderung (Event `selection.changed`). Beide Boxen und die Karte zeichnen sich daraus. Die Auswahl setzt die eine Markierung der eigenen Stadt in den Markierungspfeilen, leer nimmt sie sie weg. Mehr als 200 Gebäude bekommen keine weiteren Pfeile, bleiben aber ausgewählt.
- **Nicht gespeichert:** Nach dem Neuladen ist die Auswahl leer.
- **Was sie von selbst verliert:** Gebäude, die es in der eigenen Stadt nicht mehr gibt. Pfeile, die das Marker-Modul als entfernt meldet (Spielbild gewechselt), nehmen ihr Gebäude aus der Auswahl. Nimmt der runde Knopf mit Kreuz im Spiel alle Pfeile weg, ist die ganze Auswahl leer, auch Gebäude jenseits der 200 Pfeile.
- **Eine Markierung je Stadt** bleibt: Die Pfeile aus „Jetzt plünderbar“ gehören zur besuchten Stadt und lassen die Auswahl unberührt.

## Box

- **Box „Gebäudesuche“**, geöffnet über einen eigenen Menüeintrag (Icon: Haus mit Lupe in Akzent, nur die eigene Stadt). Nicht von Hand verstellbar, feste Breite, Höhe nach Inhalt (siehe Konzept, UI-Kit „Verstellbar nur, wo es hilft“).
- **Suchfeld nur zum Finden:** Beim Tippen zeigt eine Liste unter dem Feld die Namen der Gebäude, die es in der eigenen Stadt gibt und deren Name den Text enthält, ohne Rücksicht auf Groß- und Kleinschreibung, je mit Anzahl. Namen, die mit dem Text beginnen, stehen vorn, danach die übrigen, beide Teile alphabetisch. Die Liste zeigt höchstens 30 Namen. Gebäude neben dem Gitter (`off_grid`, `outpost_ship`, `friends_tavern`) haben keinen Platz, auf den ein Pfeil zeigen kann, und fehlen, wie im Stadtplan. Tippen allein ändert die Auswahl nicht.
- **Bedienung:** Pfeiltasten bewegen den hervorgehobenen Vorschlag, Enter wählt ihn, Escape schließt die Liste, ein Klick wählt einen Vorschlag. Tasten im Feld erreichen das Spiel nicht.
- **Wählen fügt hinzu** (Nutzer, 2026-10-25): Ein gewählter Vorschlag nimmt alle Gebäude dieses Namens in die Auswahl auf. Waren schon einige davon ausgewählt, sind es jetzt alle. Danach ist das Feld leer. Wählen nimmt nie etwas aus der Auswahl.
- **Liste der Auswahl** unter dem Feld: ein Eintrag je Gebäudename, nach Name sortiert, mit „ausgewählt/in der Stadt“, etwa „Domizil 3/12“ oder „Aachener Dom 1/1“. Das ✕ eines Eintrags nimmt alle ausgewählten Gebäude dieses Namens heraus. Darunter steht, solange etwas ausgewählt ist, ein Knopf mit Mülleimer, der alles entfernt (Tooltip „Alle entfernen“). Ist nichts ausgewählt, steht dort ein kurzer gedämpfter Hinweis.
- **Gemeinsame Komponenten:** Feld und Vorschlagsliste (`src/content/ui/name-search.ts`) sowie die Liste der Auswahl (`src/content/ui/selection-list.ts`) sind Komponenten des UI-Kits und im Stadtplan dieselben. Beide Boxen zeigen also stets dieselbe Liste.
