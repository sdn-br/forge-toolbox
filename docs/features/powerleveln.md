# Powerleveln

Stand 2026-10-24. Eigenanteil eines eigenen LGs über mehrere Stufen, Stufe für Stufe. Vorschlag und Entscheidungen: Nutzer, 2026-10-24. Baut auf dem [Eigenanteil](eigenanteil.md) auf, Datenmodell: [Great Buildings](../datenmodell/great-buildings.md).

**Box „Powerleveln“:** eigene Box, geöffnet mit einem Knopf in der Eigenanteil-Box. Der Knopf zeigt nur ein Icon: kleines LG, », großes LG, also schnell voran (Nutzer, 2026-10-24). Endfassung C10m: beide LGs mittig zur Spitze der gefüllten Pfeile, das kleine 68 % des großen, gleiche Abstände links und rechts der Pfeile. Sie zeigt das LG, das der Eigenanteil gerade zeigt, und folgt ihm, wenn der Spieler ein anderes eigenes LG öffnet. Kein Menüeintrag, ohne geöffnetes eigenes LG gibt es nichts zu rechnen.

- Kopf: Name des LGs. Darunter zwei Zahlenfelder „von“ (vorbelegt mit der laufenden Stufe) und „bis“ (vorbelegt mit von + 10), höchstens 100 Zeilen. Öffnet der Spieler ein LG, stehen beide wieder auf den Vorgaben.
- Eine Zeile je Stufe X → X+1 mit den Spalten Stufe, P1 bis P5, Eigenanteil, Doppelernte, Netto, Summe und einem Kopier-Knopf. Feste Spaltenbreiten wie im Eigenanteil (`table-layout: fixed`, Breiten in `em`). Spaltenköpfe (Nutzer, 2026-10-24): Eigenanteil als „EA“, Summe als „Σ“, Doppelernte als Icon (Münzberg mit „2×“, Variante U8: oranges „2×“, fett, mit dunklem Rand, 18 px), das Wort jeweils im Tooltip.
  - P1 bis P5: die Zahlung je Platz nach dem Faktor des Platzes, wie unter Einzahlen im Eigenanteil. Ein Platz, der nicht angeboten wird, zeigt „–“.
  - Eigenanteil: was der Eigentümer auf dieser Stufe selbst zahlt.
  - Doppelernte: FP, die das LG nach dem Leveln gleich noch einmal produziert (siehe unten). Ohne FP-Produktion fehlt die Spalte.
  - Netto: Eigenanteil minus Doppelernte.
  - Summe: laufende Summe von Netto ab der ersten Zeile.
- Laufende Stufe: rechnet mit der echten Rangliste wie die Eigenanteil-Box (Einzahlungen, Ext, Absichern, Vertrauen), unter Eigenanteil steht dort, was noch offen ist. Alle späteren Stufen gelten als offen und leer, wie die Stufenvorschau (`emptyLevel`, `calculateOwnShare` mit leerer Rangliste).
- Faktoren je Platz: dieselben wie im Eigenanteil für dieses LG (Standard, gespeichert oder geändert), und in beiden Boxen änderbar (Nutzer, 2026-10-24). Eine Änderung in der einen Box zeigt die andere sofort. Keine Box braucht die andere, das Powerleveln geht auch bei geschlossenem Eigenanteil.
  - Über der Tabelle dieselbe Faktor-Leiste wie im Eigenanteil (`ui/factor-bar.ts`): Knöpfe, freies Feld, Status-Icon (Stern, Burg, Stift) und die drei Knöpfe Speichern, Zurücksetzen, Als Standard übernehmen, mit denselben Regeln.
  - Unter den Spaltenköpfen P1 bis P5 eine Zeile mit einem schmalen Faktor-Feld je Platz, wie die Spalte Faktor im Eigenanteil (gelesen als Faktor, „Arche“ markiert). Sie gilt für alle Stufen der Tabelle.
- **Gemeinsamer Zustand** (Nutzer, 2026-10-24): Die Faktoren je LG (drei Ebenen) und die Ext-Werte der offenen Stufe hält ein eigenes Modul, nicht die Eigenanteil-Box. Beide Boxen lesen dort und schreiben dorthin, das Modul meldet jede Änderung über den Bus. „Absichern“ und „Vertrauen“ lesen beide aus der gemerkten Ansichtswahl. Vorher meldete der Eigenanteil seinen Zustand per Event an das Powerleveln, das ihn nur kannte und nicht ändern konnte.
- Geschätzte Belohnungen: Zahlungen kursiv mit „≈“ und dem Tooltip „Belohnung geschätzt, auf etwa 5 FP genau“, der Satz steht auch unter der Tabelle.
- Stufen über der freigeschalteten Höchststufe stehen gedämpft mit „noch nicht freigeschaltet“ im Tooltip der Stufe, sie werden trotzdem gerechnet. Ab einer Stufe, deren Belohnung unbekannt ist, endet die Tabelle mit einem Satz dazu. Ohne geladene Definition sagt die Box das statt der Tabelle.
- Unter der Tabelle: Summen von Eigenanteil, Doppelernte und Netto.
- Kopieren je Zeile: der Kopiertext der Eigenanteil-Box für diese Stufe, mit denselben Einstellungen (Abschnitt „Kopiertext“), Stufe im Text als `X→X+1`. Für die laufende Stufe ist es derselbe Text wie in der Eigenanteil-Box ohne Änderungen von Hand.

**Doppelernte:** Ein FP-LG, das kurz vor dem Leveln abgeerntet wird, produziert nach dem Level-Up gleich wieder, nun auf der neuen Stufe. Gezählt wird also die FP-Produktion der Stufe X+1.

- Nur für LGs, deren Definition `production_bonus` mit `type: strategy_points` hat. Ausgenommen sind die Arche (`X_FutureEra_Landmark1`) und der Tempel der Relikte (`X_AllAge_Expedition`), wie in der alten Toolbox.
- Bis Stufe 10: `production_bonus.values[X+1]` aus der Definition (Index 0 ist Stufe 0), exakt. Gesehen in der Aufnahme vom 2026-10-23, die Werte stimmen mit der Tabelle der alten Toolbox überein.
- Für die Stufe, die gerade gebaut wird: `next_production_bonus` aus `getConstruction`, exakt.
- Darüber geschätzt wie in der alten Toolbox: Produktion von Stufe 10 × (X+1) / 10, gerundet. Die Formel ist nicht gegen das Spiel geprüft, deshalb kursiv mit „≈“ und dem Tooltip „Doppelernte geschätzt“. Prüfen lässt sie sich mit einer Aufnahme, in der ein FP-LG über Stufe 10 geöffnet wird.
