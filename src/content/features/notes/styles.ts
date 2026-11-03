// The look of the notes box: the list of pages beside the open page.
export const notesCss = `
.split { display: flex; gap: 8px; align-items: flex-start; }
.split > .side { flex: 0 0 150px; min-width: 0; }
.split > .main { flex: 1; min-width: 0; }
ul.rows { list-style: none; margin: 4px 0; padding: 0; }
ul.rows li { padding: 2px 4px; cursor: pointer; border-bottom: 1px solid var(--btn); }
ul.rows li.active { background: var(--btn); }
input.title { width: 100%; font-weight: 600; }
.page-mark { display: inline-block; vertical-align: -2px; }
.page-mark svg { display: block; width: 14px; height: 14px; }
`;
