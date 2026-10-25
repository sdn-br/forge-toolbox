# Gebäudesuche

Stand 2026-10-25. Altes Modul `citysearch` der alten Toolbox, hier nur als Idee übernommen. Die Pfeile im Spiel sind die [Markierungspfeile](stadtplan.md) des Stadtplans.

**Zweck:** Alle Gebäude eines Namens in der eigenen Stadt finden, ohne den Stadtplan zu öffnen. Die Gebäude bekommen goldene Pfeile direkt im Spielbild.

## Box

- **Box „Gebäudesuche“**, geöffnet über einen eigenen Menüeintrag (Icon: Haus mit Lupe in Akzent, nur die eigene Stadt). Nicht von Hand verstellbar, feste Breite, Höhe nach Inhalt (siehe Konzept, UI-Kit „Verstellbar nur, wo es hilft“).
- **Ein Suchfeld mit Vorschlägen:** Beim Tippen zeigt eine Liste unter dem Feld die Namen der Gebäude, die es in der eigenen Stadt gibt und deren Name den Text enthält, ohne Rücksicht auf Groß- und Kleinschreibung, je mit Anzahl. Namen, die mit dem Text beginnen, stehen vorn, danach die übrigen, beide Teile alphabetisch. Die Liste zeigt höchstens 30 Namen. Gebäude neben dem Gitter (`off_grid`, `outpost_ship`, `friends_tavern`) haben keinen Platz, auf den ein Pfeil zeigen kann, und fehlen, wie im Stadtplan.
- **Bedienung:** Pfeiltasten bewegen die Auswahl, Enter wählt, Escape schließt die Liste, ein Klick wählt einen Vorschlag. Tasten im Feld erreichen das Spiel nicht.
- **Markieren:** Tippen allein setzt keine Pfeile (Nutzer, 2026-10-25). Ein gewählter Vorschlag setzt Pfeile auf alle Gebäude dieses Namens (höchstens 200), das Feld behält den Namen. Unter dem Feld steht dann, wie viele Gebäude markiert sind. Das ✕ im Feld oder ein geleertes Feld nimmt die Pfeile der Gebäudesuche wieder weg.
- **Eine Markierung je Stadt:** Gebäudesuche, Suche im Stadtplan und Klick im Stadtplan teilen sich die eine Markierung der eigenen Stadt, wer zuletzt markiert, gilt. Entscheidung: Hat ein anderer die Pfeile ersetzt oder hat der Spieler sie im Spiel weggeklickt, behält das Feld seinen Text, die Zeile darunter zeigt wieder den Hinweis statt der Anzahl. Den Vorschlag erneut wählen markiert die Gebäude wieder. Ein geleertes Feld lässt die Pfeile anderer stehen.
- **Gemeinsame Komponente:** Feld und Vorschlagsliste sind eine Komponente des UI-Kits (`src/content/ui/name-search.ts`), die auch die Suche im Stadtplan nutzt. Sie meldet nur die Wahl eines Vorschlags und das geleerte Feld, was dann geschieht, entscheidet die Box.
