# LG-Finder

Dritter Reiter der Box [Investitionen](investitionen.md), neben „Meine Investitionen“ und „Mögliche Investitionen“ (Nutzer, 2026-11-04). Altes Modul `findGB`, hier nur als Idee übernommen. Er durchsucht alle gespeicherten fremden LGs, unabhängig von Beziehung und Gewinn: etwa alle Archen ab Stufe 80, die schon angefangen sind. Datenmodell: [Great Buildings](../datenmodell/great-buildings.md).

- **Daten:** alle bekannten fremden LGs, wie die Box sie ohnehin liest (`greatBuildings.known()`). Gefiltert wird im Speicher, ohne eigenen Index und ohne eigene Abfrage. Gefüllt wird der Bestand von den LG-Listen anderer Spieler, geöffneten LGs, der Rathausliste und der Rangliste „Legendäre Bauwerke“ des Spiels (`RankingService`, siehe [Great Buildings](../datenmodell/great-buildings.md)). Eigene LGs speichert die Toolbox nicht, sie erscheinen nie.
- **Öffnen:** nur von Hand über das Menü und den Reiter. Die Rangliste öffnet die Box nicht. Der gewählte Reiter wird wie die anderen gemerkt.
- **Reiter:** das Wort „LG-Finder“ wie die beiden anderen Reiter, ohne Icon (Nutzer, 2026-11-05: ein Trichter davor machte den Reiter höher und sah wie ein Filter aus).
- **Filter:** Auswahl „LG-Typ“ (die Typen der gespeicherten LGs, benannt nach dem Katalog, ohne Namen mit der ID, nach Namen sortiert, zuerst „alle Typen“), „Stufe ab“ und „Stufe bis“ (Zahlenfelder, leer heißt offen) und der Schalter „nur angefangen“ (Fortschritt der Stufe größer 0). Der Schalter schränkt ein: an zeigt nur angefangene LGs, aus alle. Standard aus, aus ist er wie die anderen Icon-Schalter zu 25 % sichtbar. Icon A1 (Balken mit gefülltem linken Teil, `headerIcons.started`, Nutzer 2026-11-04). Am Ende der Zeile „X von Y LGs“.
- **Spalten:** Eigentümer wie in den anderen Reitern (Link zu foestats, Gilde im Tooltip, Stern und Auge bei bekannten Spielern, ohne Trichter, weil der Reiter keinen Spielerfilter hat), Beziehung (Icons), LG (mit Auge), Stufe, Fortschritt „eingezahlt / Kosten“ mit Balken und Zuwachs wie in „Mögliche Investitionen“, Stand („vor 3 T.“). Eine Spalte „Merken“ gibt es nicht.
- **Gold-Stufe:** Hat das LG die Gold-Stufe (`tier` aus der Rangliste), steht vor der Stufe eine kleine Krone in `--accent` (Icon G1, `headerIcons.goldTier`, vorläufig, bis das Zeichen des Spiels es ersetzt), Tooltip „Gold-Stufe“. Kupfer und unbekannt zeigen nichts.
- **Gedämpft:** nur ignorierte LGs und LGs ignorierter Eigentümer, nicht LGs ohne Beziehung. Der Finder sucht gerade über die Beziehungen hinaus (Entscheidung bei der Umsetzung).
- **Sortieren:** jede Spalte wie in den anderen Reitern, mit Stufen per Umschalt+Klick. Standard: Stufe absteigend. Die Sortierung gilt wie dort bis zum Neuladen, die Filter werden gemerkt (`investments.finderFilter`).
- **Zeilen:** so viele, wie in die Box passen, Mausrad und Pfeilknöpfe schieben sie (`windowedRows`).
- **Breite:** Die Box bleibt für alle Reiter gleich breit (906 px, verstellbar), die Tabelle des Finders füllt sie. Ihre Mindestbreite ist kleiner (feste Spalten Beziehung 70, Stufe 74, Fortschritt 96, Stand 72 px plus die Mindestbreite der Namen), schmaler gezogen scrollt sie wie die anderen seitwärts (Entscheidung bei der Umsetzung: ein Reiterwechsel soll die Box nicht springen lassen).
- **Live:** Jedes `greatBuildings.stored` liest den gemeldeten Eigentümer neu, also auch jede Seite und Suche der Rangliste, solange die Box offen ist.

## Testfälle

- `test/fixtures/gb-ranking.json` (Rangliste „Legendäre Bauwerke“ vom 2026-11-04 auf de10: Seite beim Öffnen mit eigenem Platz, eine Seite, Spieler- und LG-Suche, dazu der Reiter Medaillen; anonymisiert, gebaut mit `scripts/make-fixture.py gb-ranking`).
- `test/finder-investments-feature.test.ts` für Spalten, Gold-Stufe, Filter, Sortierung, Merken und Live-Füllen, `test/great-building-ranking.test.ts` für das Speichern der Rangliste.
