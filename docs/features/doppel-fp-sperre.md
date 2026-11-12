# Doppel-FP-Sperre

Wer in ein fremdes LG einzahlt, klickt leicht zweimal und zahlt doppelt. Nach einer Einzahlung deckt deshalb eine Leiste der Toolbox die Einzahlreihe des Spiels für ein paar Sekunden ab (Nutzer, 2026-11-04). Die Leiste zeigt ein Schloss (Icon S1), den Text „Eingezahlt, kurz gesperrt“ und am unteren Rand einen 3 px hohen Streifen in Orange, der in der eingestellten Zeit von voller Breite auf null schrumpft. Sie hat keinen Knopf und schluckt Klicks.

- **Einstellung:** „Sperre nach Einzahlung (Sekunden, 0 = aus)“ in der Gruppe „LG-Rechner“, Abschnitt „Doppel-FP-Sperre“. Standard 2, Bereich 0 bis 30. Bei 0 gibt es keine Sperre.
- **Auslöser:** Die Sperre startet, wenn die Anfrage `GreatBuildingsService.contributeForgePoints` das Spiel verlässt, nicht erst mit der Antwort. So deckt sie auch einen zweiten Klick ab, während die Antwort noch unterwegs ist. Der Proxy meldet dafür jede Anfrage des Spiels beim Senden (Traffic `request`), die Ingestion reicht sie an `onRequest`-Handler weiter, und `game/great-buildings.ts` macht daraus das Bus-Ereignis `greatBuilding.contributing` mit Besitzer, Gebäude und `own`. Die Anfrage hat die Form `[entityId, playerId, Stufe, Betrag, false]`, `playerId` ist der Besitzer. Der Aufzeichner nimmt die Anfragen nicht mit auf, die Antwort trägt sie schon.
- **Eigene LGs:** Keine Sperre. `own` ist wahr, wenn der Besitzer der Spieler der Sitzung ist.
- **Neue Einzahlung während der Sperre:** Zeitgeber und Streifen starten neu.
- **Ende:** nach der eingestellten Zeit, oder früher, wenn `gbWindow.changed` etwas anderes als `foreign` meldet (Fenster zu, zurück zur Liste).
- **Zusammenspiel mit der [Einzahlwarnung](einzahlwarnung.md):** Die Sperre liegt darüber (höherer z-index). Danach verhält sich die Warnung wie vorher, meist ist sie schon geschlossen, weil der Nutzer eingezahlt hat.
- **Lage:** dieselbe wie bei der Einzahlwarnung, die Maße stehen in `features/shared/contribution-row.ts` (Messung und Grenzen siehe dort und in der Einzahlwarnung). Der Rand ist `--warn` (orange) statt `--bad`.
