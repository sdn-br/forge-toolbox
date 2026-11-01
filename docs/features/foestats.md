# foestats

Stand 2026-10-31. foestats.com ist eine externe Datenquelle mit täglichen Punkten und Kämpfen je Spieler. Die API (`api.forge-db.com`) ist inoffiziell und nicht dokumentiert.

**Links:** Jeder Spieler- und Gildenname in den Boxen öffnet die Seite bei foestats in einem neuen Tab: Besuchte Stadt (Spieler, Gilde), LG-Rechner (Eigentümer, Plätze einer vergangenen Stufe), Kopf einer Spielernotiz. In der PvP-Box ist der Name seit 2026-11-01 ebenso ein Link, gefiltert wird mit dem Trichter daneben (vorher filterte der Name, und ein kleines ↗ stand daneben). Links senden nichts und erscheinen immer, auch ohne die Einstellung. Die Adresse baut eine Funktion (`src/shared/foestats.ts`). **Angenommen, im Browser noch nicht geprüft:** `<server>/<world>` ist Sprachkürzel und Welt-ID der Toolbox, etwa `de/de20`.

**Abruf:** nur beim Ansehen, für den Eigentümer des offenen fremden LGs, den Spieler der besuchten Stadt und den Spieler einer LG-Liste ([Snipehilfe](snipehilfe.md), Nutzer 2026-10-24). Eine LG-Liste, die das Spiel selbst abfragt (`askedByGame`, siehe [Great Buildings](../datenmodell/great-buildings.md)), löst keinen Abruf aus (Nutzer, 2026-10-31). Kein Abruf im Hintergrund, keine Nachbarn oder Gildenmitglieder auf Vorrat. Abgefragt wird der Tagesstand des Spielers (`/api/players/<server>/<world>/<id>`), vom Content Script und ohne Cookies (`credentials: 'omit'`). Vom Service Worker aus (Origin `chrome-extension://`) kam im Browsertest keine Antwort, vermutlich blockt Cloudflare. Von der Spielseite aus antwortet die API mit 200 und erlaubt CORS. Deshalb braucht das Manifest keine `host_permissions`.

**Verläufe brauchen eine Sitzung:** Seit 2026-10-28 antworten `/points-history` und `/battles-history` mit 403 (`Session required`). Der Tagesstand antwortet weiter mit 200. Die Toolbox fragt deshalb nur noch den Tagesstand ab und baut den Verlauf selbst daraus auf, ein Tag je Abruf. Kommt später ein API-Schlüssel, können die Verläufe zurückkommen. Wie er übergeben würde, ist offen.

Die Regeln bleiben im Service Worker, ein Abruf läuft in drei Schritten:

1. `foestats.claim`: Der Service Worker sagt, ob ein Abruf fällig ist, und reserviert ihn. Fällig ist er höchstens einmal je Spieler und foestats-Tag. foestats aktualisiert früh am Morgen, deshalb gilt ein neuer Tag erst ab 05:40 Uhr Ortszeit, davor der Vortag. Solange ein Abruf reserviert ist (höchstens 60 Sekunden), bekommen andere Ansichten und Tabs keinen.
2. Das Content Script fragt foestats nach dem Tagesstand und reicht die Antwort mit `foestats.store` zurück. Es unterscheidet drei Fälle: der Tagesstand, „unbekannt“ (404) und „nicht erreichbar“ (Netzfehler, jeder andere Fehlercode wie 403 oder 5xx, kein JSON, kein Tagesstand in der Antwort). Ein Tagesstand ohne Datum, Punkte oder Kämpfe zählt wie „unbekannt“.
3. `foestats.history` liest die Tage aus der DB.

Die zwei Fehlerfälle gelten verschieden weit (Nutzer, 2026-10-31):

- **foestats nicht erreichbar** gilt für alle Spieler, nicht je Spieler. Der Service Worker merkt sich nur im Speicher, wann foestats zuletzt nicht erreichbar war. Startet er neu, ist das vergessen, und er fragt einfach wieder. In den 30 Minuten danach gibt `foestats.claim` für jeden Spieler keinen Abruf frei. Jede Antwort von foestats hebt das sofort auf, dann ist jeder Spieler beim nächsten Ansehen wieder fällig.
- **Spieler bei foestats unbekannt** gilt je Spieler und steht in `foestatsFetches`. Gefragt wird erst am nächsten foestats-Tag wieder.

Einträge älterer Versionen, die einen gescheiterten Abruf je Spieler festhielten (`ok: false`), sind sofort wieder fällig. Sonst blieben Spieler, bei denen foestats vor 2026-10-31 mit 403 antwortete, auf „foestats nicht erreichbar“ stehen.

**Datenmodell** (Dexie-Version 10, Domäne `src/persistence/foestats/`):

- `foestatsDays` (`[world+player+date]`, Index `[world+player]`): ein Tag eines Spielers mit `points` und `battles`, am Tag eines Tagesstands auch `active` (Status laut foestats, ohne Index, ältere Zeilen haben ihn nicht, deshalb keine neue Dexie-Version). Jeder Tagesstand schreibt bis zu zwei Tage:
  - den Tag des Stands (`data_date`) mit Punkten, Kämpfen und Status. Er ersetzt einen errechneten Wert für denselben Tag.
  - den Vortag, errechnet als Punkte minus `points_change` und Kämpfe minus `battles_change`, nur wenn beide Änderungen da sind. Er füllt nur eine Lücke: Steht der Tag schon in der DB, bleibt er, wie er ist.

  Zeilen aus den früheren Verläufen (vor 2026-10-28) bleiben stehen und zählen wie Tage eines Tagesstands.
- `foestatsFetches` (`[world+player]`): letzter beantworteter Abruf je Spieler mit foestats-Tag und Zeitpunkt, dazu `unknown`, wenn foestats den Spieler nicht kennt (ohne Index, ältere Zeilen haben es nicht, deshalb keine neue Dexie-Version). So fragt ein Neuladen des Spiels nicht noch einmal. Ein Abruf, auf den foestats nicht antwortet, landet hier nicht.
- Der FoestatsStore im Content Script bringt einen Spieler beim Ansehen auf Stand und liest die Tage danach aus der DB. Die Oberfläche liest immer aus dem eigenen Speicher.

**Aktivität im LG-Rechner** (beide Reiter, auch „Mögliche Einzahlungen“), eine Zeile unter dem Eigentümer, Teile mit „·“ getrennt:

Der Status von foestats (`is_active`) wird gespeichert, aber nicht gezeigt (Nutzer, 2026-10-31). Er widersprach den Zahlen desselben Tagesstands in beide Richtungen: `is_active: true` bei 0 Punkten und 0 Kämpfen, `is_active: false` bei +21.077 Punkten und +12 Kämpfen (de10, 2026-10-31). Die Spielerseite von foestats.com nennt einen Spieler inaktiv, wenn der letzte Tagesstand weder Punkte noch Kämpfe dazubrachte, nur ihre Tabellen (Gildenmitglieder) gehen nach `is_active` (im Quelltext der Seite gesehen). Die Aussage der Spielerseite deckt „zuletzt aktiv“ ab, genauer, weil mehrere Tage zählen. Auch die 7- und 30-Tage-Änderung der Seite rechnet der Browser selbst aus `/points-history`, keine API liefert sie fertig.

1. Was die eigenen Tage sagen: „zuletzt aktiv heute / gestern / vor N Tagen“, wenn eine Zunahme von Punkten oder Kämpfen zwischen zwei aufeinanderfolgenden Kalendertagen bekannt ist, gezählt ab dem aktuellen foestats-Tag. Liegt die letzte Zunahme in einer Lücke zwischen zwei bekannten Tagen, ist ihr Tag unbekannt; dann zählt die Ruhe erst ab dem Tag nach der Lücke („seit N Tagen keine Zunahme“ ab 2 Tagen). Sagen die Tage noch nichts, steht „noch keine Zunahme bekannt“.
2. Die Änderung von Punkten und Kämpfen über 7 Tage, wenn die Tage das abdecken, sonst über die kürzere Spanne, die bekannt ist („1 Tag: …“). Ohne zweiten Tag fällt der Teil weg.

Beispiele: Beim ersten Ansehen gibt es den Tag des Stands und den errechneten Vortag, etwa „zuletzt aktiv heute · 1 Tag: +300 Punkte, +3 Kämpfe“. Nach einer Woche mit Abrufen etwa „zuletzt aktiv vor 4 Tagen · 7 Tage: +500 Punkte, +3 Kämpfe“. Ab 3 Tagen ohne Zunahme steht die Zeile als Warnung. „bei foestats unbekannt“ und „foestats nicht erreichbar“ stehen nur, solange kein Tag gespeichert ist. Die Rechnung ist eine reine Funktion (`domain/activity.ts`). Eine eigene Ansicht des Verlaufs gibt es noch nicht.

**Einstellung** „foestats-Daten abrufen“, Standard an, mit Hinweis, wann foestats.com gefragt wird. Den Satz, dass foestats dabei Welt und Spieler-ID erfährt, hat der Nutzer gestrichen, weil ihn niemand versteht (2026-10-23). Aus: keine Anfragen, keine Aktivität, Links bleiben. Entscheidung: Standard an statt Double-Opt-In wie bei Settings, die Daten nach außen senden. Gesendet wird nur, was foestats ohnehin öffentlich zeigt (Welt und Spieler-ID), keine eigenen Spieldaten.
