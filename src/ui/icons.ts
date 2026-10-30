const paths: Record<string, string> = {
  cursor: '<path d="M5 3.5 19 11l-6.1 1.9L11 19 5 3.5Z" fill="currentColor" stroke="none"/>',
  hand: '<path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6a1.5 1.5 0 0 1 3 0v6.2c0 4.1-2.5 6.8-6 6.8-2.3 0-3.7-1-4.8-2.8L4.4 13a1.7 1.7 0 0 1 2.9-1.7l.7 1.1"/>',
  ruler: '<path d="m4 15 11-11 5 5L9 20l-5-5Z"/><path d="m7 14 2 2m1-5 2 2m1-5 2 2m-9 3 2 2"/>',
  length:
    '<path d="M4 17 20 7"/><circle cx="4" cy="17" r="2.2"/><circle cx="20" cy="7" r="2.2"/><path d="M9 12h6" opacity=".55"/>',
  area: '<path d="m4 16 3-10 10-2 3 10-8 5-8-3Z"/><circle cx="7" cy="6" r="1.4" fill="currentColor"/><circle cx="17" cy="4" r="1.4" fill="currentColor"/><circle cx="20" cy="14" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>',
  count:
    '<circle cx="8" cy="8" r="2.2"/><circle cx="16" cy="8" r="2.2"/><circle cx="8" cy="16" r="2.2"/><circle cx="16" cy="16" r="2.2"/>',
  radius:
    '<circle cx="12" cy="12" r="8"/><path d="M12 12h8"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  diameter:
    '<circle cx="12" cy="12" r="8"/><path d="M4 12h16"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  arc: '<path d="M4 17a8 8 0 0 1 16 0"/><circle cx="4" cy="17" r="1.4" fill="currentColor"/><circle cx="20" cy="17" r="1.4" fill="currentColor"/>',
  angle: '<path d="M4 19h16M4 19l12-12"/><path d="M11 19a7 7 0 0 1 2-5"/>',
  slope: '<path d="M3 18 21 6"/><path d="M3 18h18M16 6h5v5"/>',
  volume: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  pen: '<path d="m4 20 1.5-5L16 4.5a2.1 2.1 0 0 1 3 3L8.5 18 4 20Z"/><path d="m14.5 6 3 3"/>',
  line: '<path d="M5 19 19 5"/><circle cx="5" cy="19" r="1.5" fill="currentColor"/><circle cx="19" cy="5" r="1.5" fill="currentColor"/>',
  arrow: '<path d="M5 19 19 5"/><path d="M11 5h8v8"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
  highlight: '<path d="m6 16 8.5-8.5 3 3L9 19l-4 1 1-4Z"/><path d="M4 21h9" opacity=".6"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M8 20h8"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/>',
  eyeOff:
    '<path d="M3 3l18 18"/><path d="M10.6 6.2A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-3.1 3.6M6.2 7.4A16 16 0 0 0 2.5 12s3.5 6 9.5 6a10 10 0 0 0 4-.8"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14M10 11v6m4-6v6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  pages:
    '<path d="M7 3h7l4 4v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/>',
  markups:
    '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>',
  quantities: '<path d="M18 5H7l5 7-5 7h11"/><path d="M15 5h3v3"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  file: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  save: '<path d="M5 3h12l3 3v15H4V3h1Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6v1"/>',
  redo: '<path d="m15 7 5 5-5 5"/><path d="M20 12h-9a6 6 0 0 0-6 6v1"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M10.5 7v7M7 10.5h7"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7 10.5h7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  download: '<path d="M12 4v11m0 0 4-4m-4 4-4-4M4 19h16"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3v.1"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  target:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  magic:
    '<path d="m5 19 9-9m-4-4 1-3 1 3 3 1-3 1-1 3-1-3-3-1 3-1ZM17 15l.7-2.3L20 12l-2.3-.7L17 9l-.7 2.3L14 12l2.3.7L17 15Z"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  csv: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.1"/>',
  cursorMove:
    '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  keyboard:
    '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.1M9 10h.1M12 10h.1M15 10h.1M18 10h.1M8 14h8"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.6 2.6 0 0 1 5 1c0 1.8-2.6 2-2.6 3.8M12 17v.1"/>',
  panelLeft: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  compare:
    '<rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .7-7.9A5.5 5.5 0 0 0 7 8.2 4.5 4.5 0 0 0 7 18Z"/>',
  callout: '<path d="M4 5h16v10H9l-4 4v-4H4V5Z"/><path d="M8 9h8M8 12h5"/>',
  stamp: '<path d="M6 15h12M8 15V9a4 4 0 0 1 8 0v6M5 19h14"/>',
  delta: '<path d="M12 4 21 20 3 20 12 4Z"/>',
  symbol:
    '<rect x="3.5" y="3" width="17" height="18" rx="2"/><circle cx="12" cy="9" r="2"/><path d="M8.5 16c0-2.1 1.6-3.7 3.5-3.7s3.5 1.6 3.5 3.7"/>',
  alignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignRight: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
};

export function icon(name: string, size = 18): string {
  const body = paths[name] ?? paths.info;
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

let brandMarkCount = 0;

/** The app mark: a measured area on a gridded tile. Mirrors src-tauri/icons/app-icon.svg. */
export function brandMark(size = 26): string {
  const id = `brand-mark-${++brandMarkCount}`;
  return `<svg class="brand-mark" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient id="${id}-rim" x1="2.5" y1=".6" x2="30" y2="31.9" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#63e7c9"/>
        <stop offset="1" stop-color="#2aa7d8"/>
      </linearGradient>
      <linearGradient id="${id}-plate" x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#15282c"/>
        <stop offset="1" stop-color="#080f11"/>
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="7" fill="url(#${id}-rim)"/>
    <rect x="1" y="1" width="30" height="30" rx="6" fill="url(#${id}-plate)"/>
    <g stroke="#4fe0bf" stroke-width=".22">
      <path d="M16 0v32M0 16h32" stroke-opacity=".26"/>
      <path d="M8 0v32M24 0v32M0 8h32M0 24h32" stroke-opacity=".156"/>
    </g>
    <path d="M7.88 18 10.38 8.88 19.63 7.5 24.13 16.25 16.63 24.5Z" fill="#5fe6c9" fill-opacity=".3"
      stroke="#5fe6c9" stroke-width="1.63" stroke-linejoin="round" stroke-linecap="round"/>
    <g fill="#9bf7e2">
      <circle cx="7.88" cy="18" r="1.5"/>
      <circle cx="10.38" cy="8.88" r="1.5"/>
      <circle cx="19.63" cy="7.5" r="1.5"/>
      <circle cx="24.13" cy="16.25" r="1.5"/>
      <circle cx="16.63" cy="24.5" r="1.5"/>
    </g>
  </svg>`;
}
