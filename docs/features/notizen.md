# Notizen

Stand 2026-10-21. Notizen gelten je Welt.

**Datenmodell** (Dexie-Version 7, Domäne `src/persistence/notes/`):

- `noteGroups` (`[world+id]`, Index `world`): Gruppe mit `name` und `sort`. Gruppen erscheinen als Reiter, eine neue kommt ans Ende.
- `notePages` (`[world+id]`, Index `world`): Seite mit `group`, `title`, `text` (Markdown), `sort` und `updatedAt`. Eine neue Seite kommt oben in ihre Gruppe.
- **Spielergruppe:** wird nicht gespeichert, steht immer vorn, lässt sich nicht umbenennen, löschen oder verschieben. Sie hält höchstens eine Seite je Spieler mit der ID `player:<Spieler-ID>` und dem Feld `player`. Name, Gilde und Beziehungen kommen live aus dem PlayerStore. Der Titel der Seite hält nur den zuletzt bekannten Namen, für Spieler, die der Store nicht kennt. Die Seite entsteht mit dem ersten Text und verschwindet, wenn der Text geleert wird. Sortiert wird sie alphabetisch nach Namen, die übrigen Gruppen und Seiten von Hand per Drag and Drop.
- Der NoteStore hält alle Notizen der Welt im Speicher. Suche und Liste brauchen keine DB-Abfrage. Jede Änderung meldet `note.changed {player?}`.

**Markdown:** Entscheidung: eigener kleiner Renderer, der lit-html-Templates baut. Er kennt Überschriften (`#` bis `###`), fett, kursiv, Aufzählungen, nummerierte Listen, Links nur auf `http:` und `https:` (neuer Tab, `rel="noopener noreferrer"`), nackte URLs, Absätze und Zeilenumbrüche. Alles andere bleibt Text.

- Begründung: Es entsteht nie rohes HTML, kein `innerHTML`, kein `unsafeHTML`. Was in einer Notiz steht, kann kein Markup und kein Skript werden, ohne Sanitizer. Keine Abhängigkeit.
- Kosten: nur eine Teilmenge von Markdown (keine Tabellen, Bilder, Code-Blöcke, Zitate).
- Verworfen: eine Markdown-Bibliothek mit Sanitizer. Sie kann mehr, liefert aber HTML-Strings, die erst bereinigt werden müssen, und bringt eine Abhängigkeit.

**Oberfläche:**

- Box „Notizen“ (📝): Reiter der Gruppen, links die Seiten, rechts die Seite. Volltextsuche über Titel und Text aller Notizen der Welt. In der Spielergruppe ein Filter nach Beziehung und eine Spielerauswahl über den PlayerStore.
- Filter nach Beziehung (2026-10-31, Nutzer): dieselben Icon-Schalter wie in den Investitionen (`ui/relations.ts`), je einer für Nachbarn, Freunde und Gilde und einer für „Andere, ohne Beziehung“ (durchgestrichene Person). Mehrere dürfen an sein, eine Seite bleibt, wenn eine ihrer Beziehungen an ist. Spieler, die der PlayerStore nicht kennt, zählen als „ohne Beziehung“. Am Anfang und nach der Wahl eines Spielers in der Spielerauswahl sind alle an. Bis dahin war es eine Auswahlliste mit genau einem Wert („Alle“, Nachbarn, Gilde, Freunde, Andere). Der Filter wird wie bisher nicht gespeichert, darum braucht der Wechsel keine Übernahme alter Werte.
- Beziehungen eines Spielers (in der Liste der Seiten und im Kopf seiner Seite) stehen als dieselben SVG-Icons wie in den Investitionen da, in der Reihenfolge Nachbar, Freund, Gilde. Vorher waren es Emoji.
- Eine Notiz zeigt gerendertes Markdown, ein Klick öffnet den Quelltext in einem Textfeld. Gespeichert wird 800 ms nach dem letzten Tastendruck und beim Verlassen. Solange das Textfeld offen ist, überschreiben Updates aus dem Store die Eingabe nicht.
- Notizkarte eines Spielers (eine Komponente): in der Box „Besuchte Stadt“ für den besuchten Spieler, in der PvP-Box, solange das Namensfeld genau einen Spieler nennt. Dort trägt jede Zeile der Kämpfe und Angriffe auf mich ein 📝 mit der Notiz als Tooltip. Ein Klick darauf schreibt den Namen ins Feld und öffnet die Karte zum Schreiben.

**Noch nicht enthalten:** Übernahme alter Notizen (kommt mit dem Altdaten-Import, siehe dort), Notizen in der PvP-Arena (Phase 6), Export (eigenes Feature).

**Avatare fehlen noch:** Das Spiel lädt Porträts mit Hash im Dateinamen (`assets/shared/avatars/portrait_413-42cc9bb44.jpg`), die Spielerdaten nennen nur `portrait_id_111`. Die Zuordnung braucht die Asset-Liste des Spiels und kommt mit dem Design-Durchgang oder einem Feature, das Porträts sowieso braucht.
