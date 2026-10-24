# foestats

Stand 2026-10-22. foestats.com ist eine externe Datenquelle mit täglichen Punkten und Kämpfen je Spieler. Die API (`api.forge-db.com`) ist inoffiziell und nicht dokumentiert.

**Links:** Jeder Spieler- und Gildenname in den Boxen öffnet die Seite bei foestats in einem neuen Tab: Stadtinformationen (Spieler, Gilde), LG-Rechner (Eigentümer, Plätze einer vergangenen Stufe), Kopf einer Spielernotiz. In der PvP-Box filtert der Name weiter, dort steht ein kleines ↗ daneben. Links senden nichts und erscheinen immer, auch ohne die Einstellung. Die Adresse baut eine Funktion (`src/shared/foestats.ts`). **Angenommen, im Browser noch nicht geprüft:** `<server>/<world>` ist Sprachkürzel und Welt-ID der Toolbox, etwa `de/de20`.

**Abruf:** nur beim Ansehen, für den Eigentümer des offenen fremden LGs, den Spieler der besuchten Stadt und den Spieler einer LG-Liste ([Snipehilfe](snipehilfe.md), Nutzer 2026-10-24). Kein Abruf im Hintergrund, keine Nachbarn oder Gildenmitglieder auf Vorrat. Die Punkte- und Kampfverläufe fragt das Content Script ab, ohne Cookies (`credentials: 'omit'`). Vom Service Worker aus (Origin `chrome-extension://`) kam im Browsertest keine Antwort, vermutlich blockt Cloudflare. Von der Spielseite aus antwortet die API mit 200 und erlaubt CORS. Deshalb braucht das Manifest keine `host_permissions`.

Die Regeln bleiben im Service Worker, ein Abruf läuft in drei Schritten:

1. `foestats.claim`: Der Service Worker sagt, ob ein Abruf fällig ist, und reserviert ihn. Fällig ist er höchstens einmal je Spieler und foestats-Tag. foestats aktualisiert früh am Morgen, deshalb gilt ein neuer Tag erst ab 05:40 Uhr Ortszeit, davor der Vortag. Nach einem Fehler ist er frühestens nach 30 Minuten wieder fällig. Solange ein Abruf reserviert ist (höchstens 60 Sekunden), bekommen andere Ansichten und Tabs keinen.
2. Das Content Script fragt foestats und reicht die gelesenen Verläufe mit `foestats.store` zurück. Fehlt ein Verlauf (Fehlercode, kein JSON, Netzfehler), gilt der Abruf als gescheitert.
3. `foestats.history` liest die Tage aus der DB.

**Datenmodell** (Dexie-Version 10, Domäne `src/persistence/foestats/`):

- `foestatsDays` (`[world+player+date]`, Index `[world+player]`): ein Tag eines Spielers mit `points` und `battles`. Vergangene Tage ändern sich nicht, neue Tage werden nur angehängt. Kommt nur einer der beiden Verläufe an, wird nichts gespeichert, sonst bekäme der Tag den fehlenden Wert nie.
- `foestatsFetches` (`[world+player]`): letzter Abruf je Spieler mit foestats-Tag, Zeitpunkt und Erfolg. So fragt ein Neuladen des Spiels nicht noch einmal.
- Der FoestatsStore im Content Script bringt einen Spieler beim Ansehen auf Stand und liest die Tage danach aus der DB. Die Oberfläche liest immer aus dem eigenen Speicher.

**Aktivität im LG-Rechner** (beide Reiter, auch „Mögliche Einzahlungen“): unter dem Eigentümer „zuletzt aktiv heute / gestern / vor N Tagen“ (letzter Tag, an dem Punkte oder Kämpfe gestiegen sind, gezählt ab dem aktuellen foestats-Tag) und die Änderung von Punkten und Kämpfen über die letzten 7 Tage. Ab 3 Tagen ohne Zunahme steht die Zeile als Warnung. Die Rechnung ist eine reine Funktion (`domain/activity.ts`). Eine eigene Ansicht des Verlaufs gibt es noch nicht.

**Einstellung** „foestats-Daten abrufen“, Standard an, mit Hinweis, wann foestats.com gefragt wird. Den Satz, dass foestats dabei Welt und Spieler-ID erfährt, hat der Nutzer gestrichen, weil ihn niemand versteht (2026-10-23). Aus: keine Anfragen, keine Aktivität, Links bleiben. Entscheidung: Standard an statt Double-Opt-In wie bei Settings, die Daten nach außen senden. Gesendet wird nur, was foestats ohnehin öffentlich zeigt (Welt und Spieler-ID), keine eigenen Spieldaten.
