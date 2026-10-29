// The look of the PvP box: the battle rows and their note markers.
export const pvpCss = `
button.marker { all: unset; cursor: pointer; }
button.marker svg { display: block; width: 14px; height: 14px; }
tr.battle-row { cursor: pointer; }
tr.battle-row.expanded, tr.details { background: #3a2a16; }
button.marker.dim { opacity: .3; }
`;
