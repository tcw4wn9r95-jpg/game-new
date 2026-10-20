// Hand-drawn inline SVG icons (original art).
const svg = (body: string, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

const INK = '#2a1606';

export const ICONS = {
  food: svg(`
    <line x1="11.5" y1="12.5" x2="5" y2="19" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/>
    <circle cx="4.1" cy="17.6" r="2.4" fill="${INK}"/><circle cx="6.4" cy="19.9" r="2.4" fill="${INK}"/>
    <line x1="11.5" y1="12.5" x2="5" y2="19" stroke="#f3e7c9" stroke-width="2.8" stroke-linecap="round"/>
    <circle cx="4.1" cy="17.6" r="1.6" fill="#f3e7c9"/><circle cx="6.4" cy="19.9" r="1.6" fill="#f3e7c9"/>
    <ellipse cx="14.8" cy="9.2" rx="7" ry="5.6" transform="rotate(-45 14.8 9.2)" fill="#c4572f" stroke="${INK}" stroke-width="1.2"/>
    <path d="M12.2 6.6c1.7-1.6 4.2-1.6 5.6-.1" stroke="#f2a476" stroke-width="1.5" fill="none" stroke-linecap="round"/>`),
  wood: svg(`
    <rect x="2" y="13.5" width="17" height="6" rx="3" fill="#8a5a2b" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="19" cy="16.5" rx="2.6" ry="3" fill="#e2bb84" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="19" cy="16.5" rx="1" ry="1.2" fill="none" stroke="#a5713a" stroke-width=".8"/>
    <rect x="3.5" y="6.5" width="16" height="6" rx="3" fill="#9b6733" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="19.5" cy="9.5" rx="2.6" ry="3" fill="#e2bb84" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="19.5" cy="9.5" rx="1" ry="1.2" fill="none" stroke="#a5713a" stroke-width=".8"/>
    <path d="M5.5 9h8M4.5 16.5h9" stroke="#6b421c" stroke-width="1" stroke-linecap="round"/>`),
  gold: svg(`
    <ellipse cx="10" cy="18" rx="7.5" ry="2.8" fill="#c8961c" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="10" cy="15" rx="7.5" ry="2.8" fill="#e0ad2a" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="10" cy="12" rx="7.5" ry="2.8" fill="#f5c842" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="10" cy="12" rx="4" ry="1.2" fill="none" stroke="#fff0a8" stroke-width="1"/>
    <circle cx="18" cy="8" r="4.6" fill="#f5c842" stroke="${INK}" stroke-width="1.2"/>
    <circle cx="18" cy="8" r="2.6" fill="none" stroke="#b9871a" stroke-width="1"/>
    <path d="M16.4 6.2l.9-.6" stroke="#fff6c2" stroke-width="1.2" stroke-linecap="round"/>`),
  stone: svg(`
    <path d="M3 19l2-7 6-2 3 3-1 6z" fill="#8f8f8b" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M11 19l1-6 5-3 4 3-1 6z" fill="#a9a9a4" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M7 10l2-5 6-1 2 5-6 2z" fill="#c4c4bf" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M9.5 6.5l4-.6M6 13l3-1M13.5 13l3-1.6" stroke="#ecece6" stroke-width="1" stroke-linecap="round"/>`),
  pop: svg(`
    <circle cx="12" cy="7.5" r="3.8" fill="#ecdcb6" stroke="${INK}" stroke-width="1.2"/>
    <path d="M4.5 20.5c.6-4.6 3.6-7.2 7.5-7.2s6.9 2.6 7.5 7.2z" fill="#3f6fb0" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M9 15.5l3 2.5 3-2.5" stroke="#f1d48a" stroke-width="1.2" fill="none"/>`),
  clock: svg(`
    <path d="M6 3h12M6 21h12" stroke="#c99a3c" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M7.5 3.5c0 5 4.5 6 4.5 8.5S7.5 15.5 7.5 20.5h9c0-5-4.5-6-4.5-8.5s4.5-3.5 4.5-8.5z" fill="#f4ead2" fill-opacity=".25" stroke="#e8d7ae" stroke-width="1.3"/>
    <path d="M9.5 19.5c.5-2 2.5-3 2.5-3s2 1 2.5 3z M10 7.5h4c-.5 1.5-2 2.4-2 2.4s-1.5-.9-2-2.4z" fill="#e2bb5c"/>`),
  crown: svg(`
    <path d="M3 18l-1-11 5.5 4.5L12 4l4.5 7.5L22 7l-1 11z" fill="#f2c94c" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
    <rect x="3" y="18" width="18" height="3" rx="1" fill="#c8962a" stroke="${INK}" stroke-width="1.2"/>
    <circle cx="12" cy="14.5" r="1.8" fill="#c0283c" stroke="${INK}" stroke-width=".8"/>
    <circle cx="2" cy="7" r="1.4" fill="#f2c94c" stroke="${INK}" stroke-width=".8"/>
    <circle cx="12" cy="4" r="1.4" fill="#f2c94c" stroke="${INK}" stroke-width=".8"/>
    <circle cx="22" cy="7" r="1.4" fill="#f2c94c" stroke="${INK}" stroke-width=".8"/>`),
  bell: svg(`
    <path d="M12 2.5c.9 0 1.6.7 1.6 1.6v.6c3 .8 4.7 3.4 4.7 6.7v3.2l1.9 2.7c.4.6 0 1.4-.7 1.4H4.5c-.7 0-1.1-.8-.7-1.4l1.9-2.7v-3.2c0-3.3 1.7-5.9 4.7-6.7v-.6c0-.9.7-1.6 1.6-1.6z" fill="#e2b84a" stroke="#2a1606" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M8.2 11c.2-2 1.3-3.4 3-3.9" stroke="#fff3c4" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    <circle cx="12" cy="20.2" r="2" fill="#8a5f1c" stroke="#2a1606" stroke-width="1"/>`),
  gear: svg(`
    <path d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z" fill="#c8962a" stroke="#2a1606" stroke-width="1.1" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="3.4" fill="#2a1606"/>`),
  pause: svg(`
    <path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z" fill="#f1d48a" stroke="#2a1606" stroke-width="1.2" stroke-linejoin="round"/>`),
  play: svg(`
    <path d="M7.5 4.5l11 7.5-11 7.5z" fill="#f1d48a" stroke="#2a1606" stroke-width="1.2" stroke-linejoin="round"/>`),
  menu: svg(`
    <path d="M5 7h14M5 12h14M5 17h14" stroke="#2a1606" stroke-width="4" stroke-linecap="round"/>
    <path d="M5 7h14M5 12h14M5 17h14" stroke="#f1d48a" stroke-width="2.2" stroke-linecap="round"/>`),
  villager: svg(`
    <circle cx="12" cy="6.5" r="3.4" fill="#e0b48c" stroke="${INK}" stroke-width="1.1"/>
    <path d="M8.6 6c0-2.6 1.6-4 3.4-4s3.4 1.4 3.4 4z" fill="#7a5a36"/>
    <path d="M6 21l1.6-8.5c.4-2 2.2-3 4.4-3s4 1 4.4 3L18 21z" fill="#3f6fb0" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M7.5 15.5h9" stroke="#5a3a1c" stroke-width="1.4"/>
    <path d="M17 9l4-4" stroke="#6b4a2a" stroke-width="1.6" stroke-linecap="round"/><path d="M19.5 3.5l2.5 1-1 2.5z" fill="#a8b0b6" stroke="${INK}" stroke-width=".6"/>`),
  scout: svg(`
    <path d="M3 17c0-3 2-5 6-5h6l3-4 3 1-2 5v4" fill="#8a5a30" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M5 17v4M9 17v4M15 17v4M18 17v4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M10 12l1-6h3l1 6z" fill="#3f6fb0" stroke="${INK}" stroke-width="1"/>
    <circle cx="12.5" cy="4.2" r="2" fill="#e0b48c" stroke="${INK}" stroke-width=".9"/>`),
  town_center: svg(`
    <path d="M2 21V12h20v9z" fill="#d8c8a0" stroke="${INK}" stroke-width="1.1"/>
    <path d="M1 12.5L5 7h14l4 5.5z" fill="#d1ae5c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M9 12V6h6v6z" fill="#d8c8a0" stroke="${INK}" stroke-width="1"/><path d="M8 6.5l4-4 4 4z" fill="#d1ae5c" stroke="${INK}" stroke-width="1"/>
    <path d="M10.5 21v-4a1.5 1.5 0 013 0v4z" fill="#3a2412"/><path d="M12 2.5V0" stroke="${INK}"/><path d="M12 .2l3 .9-3 .9z" fill="#3f6fb0"/>`),
  house: svg(`
    <path d="M4 21v-8h16v8z" fill="#d8c8a0" stroke="${INK}" stroke-width="1.1"/>
    <path d="M2 13.5L7 6h10l5 7.5z" fill="#d1ae5c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M7 21v-4.5a1.5 1.5 0 013 0V21z" fill="#3a2412"/><rect x="14" y="15" width="3" height="3" fill="#3a2412"/>`),
  lumber_camp: svg(`
    <path d="M2 11L6 5h11l3 6z" fill="#d1ae5c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M4 11v9M18 11v9" stroke="#5a3d22" stroke-width="1.6"/><rect x="4" y="11" width="14" height="6" fill="#2b1d10"/>
    <g fill="#d6b07a" stroke="${INK}" stroke-width=".8"><circle cx="9" cy="20" r="2"/><circle cx="13" cy="20" r="2"/><circle cx="11" cy="17" r="2"/></g>`),
  mining_camp: svg(`
    <path d="M2 11L6 5h11l3 6z" fill="#d1ae5c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M4 11v9M18 11v9" stroke="#5a3d22" stroke-width="1.6"/><rect x="4" y="11" width="14" height="6" fill="#2b1d10"/>
    <rect x="7" y="15" width="9" height="4.5" fill="#5a4a3a" stroke="${INK}" stroke-width=".9"/>
    <circle cx="9" cy="20.5" r="1.4" fill="${INK}"/><circle cx="14" cy="20.5" r="1.4" fill="${INK}"/>
    <circle cx="10" cy="14.5" r="1.6" fill="#f2c230" stroke="${INK}" stroke-width=".6"/><circle cx="13" cy="14.8" r="1.5" fill="#b4b4ae" stroke="${INK}" stroke-width=".6"/>`),
  mill: svg(`
    <path d="M6 21v-8h12v8z" fill="#d8c8a0" stroke="${INK}" stroke-width="1.1"/>
    <path d="M4.5 13.5L8 9h8l3.5 4.5z" fill="#d1ae5c" stroke="${INK}" stroke-width="1"/>
    <g stroke="#5a3d22" stroke-width="1.4"><path d="M12 9L5 2M12 9l7-7M12 9L4 15M12 9l8 6"/></g>
    <g fill="#f0e6cc" stroke="${INK}" stroke-width=".5"><path d="M6 2.5l2.6 1-2.2 2.2-1.4-2.4z"/><path d="M18 2.5l-2.6 1 2.2 2.2 1.4-2.4z"/></g>
    <circle cx="12" cy="9" r="1.5" fill="${INK}"/>`),
  hammer: svg(`
    <path d="M13 9l8 8-2.5 2.5-8-8" fill="#8a5a30" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M3 9.5L9.5 3l5 5-6.5 6.5z" fill="#a8b0b6" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M5.5 9.3l4-4" stroke="#e6ecef" stroke-width="1.2" stroke-linecap="round"/>`),
  stop: svg(`
    <path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z" fill="#b8352b" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <rect x="7" y="10.5" width="10" height="3" rx="1" fill="#f6ead0"/>`),
  close: svg(`<path d="M6 6l12 12M18 6L6 18" stroke="${INK}" stroke-width="4.2" stroke-linecap="round"/><path d="M6 6l12 12M18 6L6 18" stroke="#f1d48a" stroke-width="2.2" stroke-linecap="round"/>`),
  check: svg(`<path d="M4 12.5l5 5L20 6.5" fill="none" stroke="${INK}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#9cf59a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  sheep: svg(`<ellipse cx="11" cy="13" rx="7" ry="5" fill="#f3f2ea" stroke="${INK}" stroke-width="1.1"/><ellipse cx="18.5" cy="11" rx="2.6" ry="2" fill="#3a3a3a"/><path d="M7 17.5v3M14 17.5v3" stroke="${INK}" stroke-width="1.6"/>`),
  deer: svg(`<ellipse cx="11" cy="13" rx="7" ry="3.6" fill="#9b6a3c" stroke="${INK}" stroke-width="1.1"/><path d="M16 11l3-6 2 1-2 6" fill="#9b6a3c" stroke="${INK}" stroke-width="1"/><path d="M19 5l-1-3M20 5l2-2" stroke="#d8c6a4" stroke-width="1.1"/><path d="M6 16v5M9 16v5M14 16v5M16 16v5" stroke="${INK}" stroke-width="1.4"/>`),
  fish: svg(`<path d="M3 12c4-5 10-5 14 0-4 5-10 5-14 0z" fill="#6aa7c9" stroke="${INK}" stroke-width="1.1"/><path d="M17 12l4-4v8z" fill="#6aa7c9" stroke="${INK}" stroke-width="1.1"/><circle cx="7" cy="11" r="1" fill="${INK}"/>`),
  attack: svg(`
    <path d="M19.5 2.5l2 2L9 17l-2-2z" fill="#c9d1d6" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M18 4l2 2" stroke="#fff" stroke-width=".8"/>
    <path d="M4.5 13.5l6 6M6 19l-3 3" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M4.5 13.5l6 6" stroke="#c8962a" stroke-width="2" stroke-linecap="round"/><path d="M6 19l-3 3" stroke="#6b4a2a" stroke-width="2" stroke-linecap="round"/>`),
  meleeArmor: svg(`
    <path d="M12 2l8 3v6c0 5.5-3.5 9-8 11-4.5-2-8-5.5-8-11V5z" fill="#8a96a0" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M12 4.2l6 2.3v4.6c0 4.2-2.6 7-6 8.6z" fill="#b8c2c8"/><path d="M12 6v13" stroke="${INK}" stroke-width="1"/>`),
  pierceArmor: svg(`
    <path d="M12 2l8 3v6c0 5.5-3.5 9-8 11-4.5-2-8-5.5-8-11V5z" fill="#8a6a42" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M12 4.2l6 2.3v4.6c0 4.2-2.6 7-6 8.6z" fill="#b08a58"/>
    <path d="M3 21L15 9" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M3 21L15 9" stroke="#d8c6a4" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M13 7l4.5-1.5L16 10z" fill="#c9d1d6" stroke="${INK}" stroke-width=".8"/>`),
  range: svg(`
    <path d="M6 2c8 3 12 9 12 20" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M6 2c8 3 12 9 12 20" fill="none" stroke="#9b6a3c" stroke-width="2" stroke-linecap="round"/>
    <path d="M6 2l12 20" stroke="#efe6cc" stroke-width="1"/><path d="M2 14h14M13 11l4 3-4 3" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  speed: svg(`
    <path d="M7 3h6l-1 9 8 3.5c1.5.7 1.6 2.5 1.5 4.5H4l1-8z" fill="#7a5230" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M4 18h17.6" stroke="${INK}" stroke-width="1.6"/><path d="M8 6h4" stroke="#b08a58" stroke-width="1.3"/>
    <path d="M1 8h3M0 12h3" stroke="#efe6cc" stroke-width="1.4" stroke-linecap="round"/>`),
  los: svg(`
    <path d="M1.5 12C5 6.5 8.5 5 12 5s7 1.5 10.5 7C19 17.5 15.5 19 12 19s-7-1.5-10.5-7z" fill="#efe6cc" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="4.4" fill="#4a7ab0" stroke="${INK}" stroke-width="1.1"/><circle cx="12" cy="12" r="1.8" fill="${INK}"/><circle cx="10.6" cy="10.6" r="1" fill="#fff"/>`),
  military: svg(`
    <path d="M3 3l14 14M21 3L7 17" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M3 3l14 14M21 3L7 17" stroke="#c9d1d6" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M15 19l4-4M9 19l-4-4" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M17.5 17.5l3 3M6.5 17.5l-3 3" stroke="#c8962a" stroke-width="2.4" stroke-linecap="round"/>`),
  economy: svg(`
    <path d="M3 21v-7h12v7z" fill="#d8c8a0" stroke="${INK}" stroke-width="1.1"/>
    <path d="M1.5 14.5L5 9h8l3.5 5.5z" fill="#d1ae5c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M7 21v-3.5a1.5 1.5 0 013 0V21z" fill="#3a2412"/>
    <path d="M15 6l6 6-1.6 1.6-6-6" fill="#8a5a30" stroke="${INK}" stroke-width="1"/>
    <path d="M12 7.5l4.5-4.5 3 3L15 10.5z" fill="#a8b0b6" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`),
  helmet: svg(`
    <path d="M4 15c0-6 3.5-11 8-11s8 5 8 11v3H4z" fill="#a8b0b6" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M11 9h2v10h-2z" fill="#6d777d" stroke="${INK}" stroke-width=".8"/><path d="M4 15h16" stroke="${INK}" stroke-width="1.2"/>
    <path d="M7 7c1.5-1.5 3-2 5-2" stroke="#eef3f5" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M12 4c2-3 5-3 6-2" stroke="#b8352b" stroke-width="2.2" fill="none" stroke-linecap="round"/>`),
  ship: svg(`
    <path d="M2 15h20l-3 5H5z" fill="#7a5230" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M12 2v13" stroke="${INK}" stroke-width="1.6"/><path d="M12 3l7 9h-7z" fill="#efe6cc" stroke="${INK}" stroke-width="1"/>
    <path d="M12 5l-6 7h6z" fill="#d8ccae" stroke="${INK}" stroke-width="1"/><path d="M1 21c3 1.5 6-1.5 11 0s8-1.5 11 0" stroke="#4a8ac0" stroke-width="1.4" fill="none"/>`),
  dock: svg(`<path d="M1 18h22v2H1z" fill="#8a6038" stroke="${INK}" stroke-width="1"/><path d="M3 20v3M8 20v3M16 20v3M21 20v3" stroke="#4e331b" stroke-width="1.4"/><path d="M3 18V10h10v8z" fill="#d3c39f" stroke="${INK}" stroke-width="1.1"/><path d="M2 10.5L8 5l6 5.5z" fill="#bf9f55" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M6 18v-4h4v4z" fill="#2a1a0c"/><path d="M18 18V4M18 5h5M22.5 5v6" stroke="#6b4626" stroke-width="1.6" stroke-linecap="round"/><rect x="21" y="11" width="3" height="2.4" fill="#8a6a42" stroke="${INK}" stroke-width=".6"/>`),
  fish_trap: svg(`<ellipse cx="12" cy="15" rx="10" ry="5.5" fill="#2f6f9f" stroke="${INK}" stroke-width="1"/><path d="M3 15v-5M6 19v-5M12 20.5v-5M18 19v-5M21 15v-5M7 10.5v-5M12 9.5v-5M17 10.5v-5" stroke="#6b4626" stroke-width="1.6" stroke-linecap="round"/><path d="M3 12c3 2 15 2 18 0M6 16c3 2 9 2 12 0" stroke="#e6dcc0" stroke-width=".8" fill="none"/><path d="M9 14.5c1.5-1.4 3.5-1.4 5 0-1.5 1.4-3.5 1.4-5 0zm5 0l2-1.3v2.6z" fill="#cfd8dc" stroke="${INK}" stroke-width=".6"/>`),
  fishing_ship: svg(`<path d="M3 16h18l-3 4H6z" fill="#86603a" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M11 16V3" stroke="${INK}" stroke-width="1.4"/><path d="M11 4l-7 10h7z" fill="#e8dcc0" stroke="${INK}" stroke-width="1"/><path d="M16 9l5 9" stroke="#4a3020" stroke-width="1.2"/><path d="M19 15l3 4-4 1z" fill="none" stroke="#e6dcc0" stroke-width=".9"/><path d="M1 21.5c3 1.5 6-1.5 11 0s8-1.5 11 0" stroke="#4a8ac0" stroke-width="1.4" fill="none"/>`),
  transport_ship: svg(`<path d="M1 14h22l-4 6H5z" fill="#7a5434" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 14V2" stroke="${INK}" stroke-width="1.5"/><path d="M5 3.5h14v8H5z" fill="#efe6cc" stroke="${INK}" stroke-width="1"/><path d="M5 6.5h14v2.4H5z" fill="#3f6fb0"/><rect x="15" y="10.5" width="4" height="3.5" fill="#9a7040" stroke="${INK}" stroke-width=".7"/><rect x="4" y="11" width="3.5" height="3" fill="#9a7040" stroke="${INK}" stroke-width=".7"/><path d="M1 21.5c3 1.5 6-1.5 11 0s8-1.5 11 0" stroke="#4a8ac0" stroke-width="1.4" fill="none"/>`),
  galley: svg(`<path d="M1 14h20l2-2-3 6H5z" fill="#6e4a2c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 14V2" stroke="${INK}" stroke-width="1.5"/><path d="M6 3.5h12v8H6z" fill="#efe6cc" stroke="${INK}" stroke-width="1"/><path d="M6 6.5h12v2.4H6z" fill="#c0283c"/><path d="M5 15l-3 5M9 15l-3 5M13 15l-3 5M17 15l-3 5" stroke="#4e331b" stroke-width="1.1" stroke-linecap="round"/><path d="M21 15h3" stroke="#c9a04a" stroke-width="1.8" stroke-linecap="round"/>`),
  fire_ship: svg(`<path d="M2 15h20l-3 5H5z" fill="#4c3424" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M9 15V4" stroke="${INK}" stroke-width="1.4"/><path d="M4 5h10v7H4z" fill="#d8cdb0" stroke="${INK}" stroke-width="1"/><path d="M18 14c-3-2-2-5 0-8 0 3 3 3 3 6 0 1.5-1.2 2-3 2z" fill="#f08a24" stroke="${INK}" stroke-width=".9"/><path d="M18.5 13c-1-1-.6-2.5.3-3.6.3 1.4 1.4 1.6 1.2 2.7-.1.6-.7.9-1.5.9z" fill="#ffe08a"/><path d="M1 21.5c3 1.5 6-1.5 11 0s8-1.5 11 0" stroke="#4a8ac0" stroke-width="1.4" fill="none"/>`),
  demolition_raft: svg(`<path d="M2 16h20v3H2z" fill="#7c6440" stroke="${INK}" stroke-width="1.1"/><path d="M6 16v3M10 16v3M14 16v3M18 16v3" stroke="#4e331b" stroke-width=".8"/><ellipse cx="9" cy="12.5" rx="3" ry="3.5" fill="#5a3a20" stroke="${INK}" stroke-width="1"/><ellipse cx="15" cy="12.5" rx="3" ry="3.5" fill="#5a3a20" stroke="${INK}" stroke-width="1"/><path d="M8 11h2M14 11h2" stroke="#2d2925" stroke-width="1"/><path d="M12 9c1-3 3-4 5-5" stroke="#3a3020" stroke-width=".9" fill="none"/><circle cx="17.5" cy="3.8" r="1.6" fill="#ffb030"/><path d="M1 21.5c3 1.5 6-1.5 11 0s8-1.5 11 0" stroke="#4a8ac0" stroke-width="1.4" fill="none"/>`),
  siege_barge: svg(`<path d="M1 15h22l-2 5H3z" fill="#6a4a2e" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M5 15l4-8 4 8M5 11h8" stroke="#5a3c22" stroke-width="1.6" stroke-linejoin="round" fill="none"/><path d="M9 13L20 4" stroke="#6e4a2a" stroke-width="1.8" stroke-linecap="round"/><circle cx="20.5" cy="3.5" r="2" fill="#8a8680" stroke="${INK}" stroke-width=".8"/><path d="M1 21.5c3 1.5 6-1.5 11 0s8-1.5 11 0" stroke="#4a8ac0" stroke-width="1.4" fill="none"/>`),
  back: svg(`<path d="M14 5l-7 7 7 7" fill="none" stroke="${INK}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 5l-7 7 7 7" fill="none" stroke="#f1d48a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  militia: svg(`
    <circle cx="11" cy="7" r="3.4" fill="#e0b48c" stroke="${INK}" stroke-width="1.1"/>
    <path d="M7.2 6.5L8.5 3l2.5-1.5L13.5 3l1.3 3.5z" fill="#b8c2c8" stroke="${INK}" stroke-width="1"/>
    <path d="M6 21l1.4-8c.4-2 2-3 3.6-3s3.2 1 3.6 3L16 21z" fill="#3f6fb0" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M7 14h8M7 17h8" stroke="rgba(0,0,0,.35)" stroke-width=".9"/>
    <circle cx="6" cy="15" r="3.6" fill="#3f6fb0" stroke="${INK}" stroke-width="1"/><circle cx="6" cy="15" r="1" fill="#d9b44a"/>
    <path d="M17 13l5-9" stroke="#c9d1d6" stroke-width="1.8" stroke-linecap="round"/><path d="M15.5 12.5l3 1.6" stroke="#c8962a" stroke-width="1.6"/>`),
  spearman: svg(`
    <circle cx="10" cy="7.5" r="3.3" fill="#e0b48c" stroke="${INK}" stroke-width="1.1"/>
    <path d="M6.6 7c0-2.8 1.6-4 3.4-4s3.4 1.2 3.4 4z" fill="#7a5230" stroke="${INK}" stroke-width=".8"/>
    <path d="M5 21l1.4-8c.4-2 2-3 3.6-3s3.2 1 3.6 3L15 21z" fill="#3f6fb0" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M6 14.5h8M6 17.5h8" stroke="rgba(0,0,0,.35)" stroke-width=".9"/>
    <path d="M17 23L20 2" stroke="#7a5430" stroke-width="1.6" stroke-linecap="round"/><path d="M19.2 4.5L20.4 0l1 4.7z" fill="#c9d1d6" stroke="${INK}" stroke-width=".6"/>`),
  archer: svg(`
    <path d="M7 10c0-4 2-7 5-7s5 3 5 7c-1 2-9 2-10 0z" fill="#56683e" stroke="${INK}" stroke-width="1"/>
    <circle cx="12" cy="8.5" r="2.6" fill="#e0b48c"/>
    <path d="M6.5 21l1.4-8c.4-2 2-3 4.1-3s3.7 1 4.1 3L17.5 21z" fill="#2f5aa0" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M19 3c4 5 4 13 0 18" fill="none" stroke="#8a5a2b" stroke-width="1.8" stroke-linecap="round"/><path d="M19 3v18" stroke="#f1e9d6" stroke-width=".6"/>
    <path d="M9 12l10 0" stroke="#c9a46a" stroke-width="1"/><path d="M19 11l2 1-2 1z" fill="#c9d1d6"/>`),
  skirmisher: svg(`
    <circle cx="12" cy="7" r="3.2" fill="#e0b48c" stroke="${INK}" stroke-width="1.1"/>
    <path d="M8.8 5.8h6.4" stroke="#2f5aa0" stroke-width="1.6"/>
    <path d="M7.5 21l1.4-8c.4-2 1.6-3 3.1-3s2.7 1 3.1 3L16.5 21z" fill="#6b5a42" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <ellipse cx="6" cy="15" rx="4" ry="6" fill="#b8975a" stroke="${INK}" stroke-width="1"/><path d="M2.5 12.5c2 1 5 1 7 0M2.3 15c2 1 5.4 1 7.4 0M2.5 17.5c2 1 5 1 7 0" stroke="#7a5a28" stroke-width=".7" fill="none"/>
    <path d="M15 14l7-11M17 15l6-10" stroke="#7a5430" stroke-width="1.2" stroke-linecap="round"/><path d="M21.2 4.2l1.6-2.5.2 3z" fill="#c9d1d6"/>`),
  knight: svg(`
    <path d="M2 17c0-3 2-5 6-5h7l3-4 3 1-2 5v4" fill="#8f8a84" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M3 15h15v3H3z" fill="#2f5aa0" stroke="${INK}" stroke-width=".8"/>
    <path d="M4 18v4M8 18v4M14 18v4M17 18v4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M8.5 12l1-6h4l1 6z" fill="#2f5aa0" stroke="${INK}" stroke-width="1"/>
    <rect x="9.6" y="1.2" width="4.4" height="4.6" rx=".5" fill="#c4ccd1" stroke="${INK}" stroke-width=".9"/><path d="M10.3 3.4h3" stroke="#1a1a1a" stroke-width=".8"/>
    <path d="M13 9l11-2" stroke="#7a5430" stroke-width="1.4" stroke-linecap="round"/>`),
  claymore: svg(`
    <circle cx="11" cy="7.5" r="3.2" fill="#e0b48c" stroke="${INK}" stroke-width="1.1"/>
    <path d="M7.4 6c0-2.4 1.6-3.4 3.6-3.4s3.6 1 3.6 3.4z" fill="#2f3f6a" stroke="${INK}" stroke-width=".8"/><path d="M8 4l-3-3" stroke="#efe9dc" stroke-width="1.2"/>
    <path d="M6.5 16l1.3-4.6c.4-1.6 1.6-2.2 3.2-2.2s2.8.6 3.2 2.2L15.5 16z" fill="#2f5aa0" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M6.5 16h9l1 4h-11z" fill="#3e6a3a" stroke="${INK}" stroke-width="1"/><path d="M9 16v4M13 16v4M6 18h11" stroke="#c03838" stroke-width=".7"/>
    <path d="M17 18L22 2" stroke="#d8dee2" stroke-width="2.2" stroke-linecap="round"/><path d="M15 15l5 1.6" stroke="#8a8f92" stroke-width="1.6" stroke-linecap="round"/>`),
  horse_archer: svg(`
    <path d="M2 17c0-3 2-5 6-5h7l3-4 3 1-2 5v4" fill="#c9a46c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M5 15h11v2H5z" fill="#2f5aa0" stroke="${INK}" stroke-width=".7"/>
    <path d="M4 18v4M8 18v4M14 18v4M17 18v4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M8.5 12l1-5h4l1 5z" fill="#2f5aa0" stroke="${INK}" stroke-width="1"/>
    <circle cx="11.7" cy="4.6" r="2.4" fill="#e0b48c" stroke="${INK}" stroke-width=".8"/><path d="M9 3.6h5.4" stroke="#6a4a2c" stroke-width="1.8"/>
    <path d="M17 1c3 3 3 9 0 12" fill="none" stroke="#8a5a2b" stroke-width="1.6" stroke-linecap="round"/><path d="M17 1v12" stroke="#f1e9d6" stroke-width=".5"/>`),
  arbalest_guard: svg(`
    <rect x="1.5" y="6" width="7" height="14" rx="1" fill="#2f5aa0" stroke="${INK}" stroke-width="1"/><path d="M5 7v12" stroke="#1d3c70" stroke-width="1.6"/>
    <circle cx="13" cy="7.5" r="3" fill="#e0b48c" stroke="${INK}" stroke-width="1"/><path d="M10 6.5c0-3 1.4-4 3-4s3 1 3 4z" fill="#c4ccd1" stroke="${INK}" stroke-width=".8"/>
    <path d="M9 21l1.2-7c.4-2 1.4-3 2.8-3s2.4 1 2.8 3L17 21z" fill="#3e5a8a" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M14 13h9" stroke="#7a5430" stroke-width="2"/><path d="M21 9.5v7" stroke="#6d777d" stroke-width="1.6" stroke-linecap="round"/>`),
  iron_bear: svg(`
    <path d="M2 17c0-3 2-5 6-5h7l3-4 3 1-2 5v4" fill="#3e322b" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M2.5 14h16v5h-16z" fill="#2f5aa0" stroke="${INK}" stroke-width=".8"/><path d="M4 16.5h13" stroke="#c4ccd1" stroke-width="1" stroke-dasharray="1.5 1"/>
    <path d="M4 19v3M8 19v3M14 19v3M17 19v3" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M7.5 12.5l1-6h5l1 6z" fill="#7d868b" stroke="${INK}" stroke-width="1"/>
    <path d="M7 8c0-2 2-4 4.5-4S16 6 16 8c-1 1-8 1-9 0z" fill="#563824" stroke="${INK}" stroke-width=".8"/><circle cx="8" cy="4.6" r="1.2" fill="#563824"/><circle cx="15" cy="4.6" r="1.2" fill="#563824"/>`),
  king: svg(`
    <path d="M7.5 7l-.8-4 2.6 2L12 1.8 14.7 5l2.6-2-.8 4z" fill="#f2c94c" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <circle cx="12" cy="9.5" r="3" fill="#e0b48c" stroke="${INK}" stroke-width="1"/>
    <path d="M5 22l2-8.5c.5-1.8 2.5-2.8 5-2.8s4.5 1 5 2.8L19 22z" fill="#2f5aa0" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M5 21h14M8 12.5h8" stroke="#f4f1ea" stroke-width="1.8"/>
    <path d="M18.5 20l2-10" stroke="#d9b041" stroke-width="1.4"/><circle cx="20.6" cy="9.4" r="1.5" fill="#f0cf5a" stroke="${INK}" stroke-width=".6"/>`),
  relic: svg(`
    <path d="M4 10h16v10H4z" fill="#c8962a" stroke="${INK}" stroke-width="1.2"/>
    <path d="M3 10l3-5h12l3 5z" fill="#f0cf5a" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M12 12v6M9.5 14.5h5" stroke="#fff6d8" stroke-width="1.6" stroke-linecap="round"/>`),
  wonder: svg(`
    <path d="M2 21h20v-2H2zM4 19h16v-2H4z" fill="#e3dccb" stroke="${INK}" stroke-width=".9"/>
    <path d="M6 17V10h12v7z" fill="#efe9dc" stroke="${INK}" stroke-width="1"/><path d="M8 11v6M10.7 11v6M13.3 11v6M16 11v6" stroke="#a89f8c" stroke-width="1"/>
    <path d="M7.5 10L12 3l4.5 7z" fill="#3d6f8f" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M12 3V.8" stroke="#d9b041" stroke-width="1.4"/><circle cx="12" cy="1" r="1" fill="#f0cf5a"/>`),
  monk: svg(`
    <circle cx="12" cy="6.5" r="3.3" fill="#e0b48c" stroke="${INK}" stroke-width="1.1"/>
    <path d="M9.2 5.2a3 2 0 015.6 0" fill="none" stroke="#6b4a28" stroke-width="1.4"/>
    <path d="M6 22l1.6-10c.4-2 2.2-3 4.4-3s4 1 4.4 3L18 22z" fill="#6e5236" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M10.5 10v11M13.5 10v11" stroke="#2f5aa0" stroke-width="1.4"/><path d="M8 15h8" stroke="#d8c9a0" stroke-width="1"/>
    <path d="M19.5 22V4" stroke="#6b4a28" stroke-width="1.5" stroke-linecap="round"/><path d="M17.8 5.5h3.4M19.5 3.5v4" stroke="#d9b44a" stroke-width="1"/>`),
  archery_range: svg(`
    <path d="M2 14v-4h14v4z" fill="#d8c8a0" stroke="${INK}" stroke-width="1"/>
    <path d="M1 10.5L4 6.5h10l3 4z" fill="#8a6a48" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="17" cy="16" r="5" fill="#e8d08a" stroke="${INK}" stroke-width="1"/><circle cx="17" cy="16" r="3.2" fill="#2f5aa0"/><circle cx="17" cy="16" r="1.4" fill="#f2ece0"/>
    <path d="M10 15.5l6.2.4" stroke="#3a2614" stroke-width="1"/><path d="M15 22l2-6 2 6" stroke="#5a3d22" stroke-width="1" fill="none"/>`),
  stable: svg(`
    <path d="M2 21v-9h20v9z" fill="#8a6440" stroke="${INK}" stroke-width="1.1"/>
    <path d="M1 12.5L5 7h14l4 5.5z" fill="#d1ae5c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M5 21v-6h4v6M15 21v-6h4v6" fill="#2a1a0c" stroke="${INK}" stroke-width=".8"/>
    <path d="M10.5 11.5h3v2h-3z" fill="#e0c870"/>
    <path d="M15.3 15.5c1-1.5 2.4-1.8 3.2-.5l-.4 2" fill="#8a5a30" stroke="${INK}" stroke-width=".7"/>`),
  monastery: svg(`
    <path d="M3 21V11h12v10z" fill="#a8a194" stroke="${INK}" stroke-width="1.1"/>
    <path d="M2 11.5L9 5l7 6.5z" fill="#8a5a40" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M15 21V8h5v13z" fill="#b5ae9f" stroke="${INK}" stroke-width="1.1"/><path d="M14.5 8.5l3-3.5 3 3.5z" fill="#8a5a40" stroke="${INK}" stroke-width="1"/>
    <path d="M17.5 5V1.5M16.2 2.8h2.6" stroke="#d9b44a" stroke-width="1"/>
    <path d="M7.5 21v-4a1.5 1.5 0 013 0v4z" fill="#3a2412"/><circle cx="9" cy="13.5" r="1.4" fill="#2f5aa0" stroke="${INK}" stroke-width=".6"/>`),
  more: svg(`<circle cx="5" cy="12" r="2.6" fill="#f1d48a" stroke="${INK}" stroke-width="1.2"/><circle cx="12" cy="12" r="2.6" fill="#f1d48a" stroke="${INK}" stroke-width="1.2"/><circle cx="19" cy="12" r="2.6" fill="#f1d48a" stroke="${INK}" stroke-width="1.2"/>`),
  buy: svg(`
    <circle cx="9" cy="14" r="6.5" fill="#f5c842" stroke="${INK}" stroke-width="1.2"/><circle cx="9" cy="14" r="4" fill="none" stroke="#b9871a" stroke-width="1"/>
    <path d="M17 13V3M13.5 6.5L17 3l3.5 3.5" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17 13V3M13.5 6.5L17 3l3.5 3.5" fill="none" stroke="#9cf59a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  sell: svg(`
    <circle cx="9" cy="14" r="6.5" fill="#f5c842" stroke="${INK}" stroke-width="1.2"/><circle cx="9" cy="14" r="4" fill="none" stroke="#b9871a" stroke-width="1"/>
    <path d="M17 3v10M13.5 9.5L17 13l3.5-3.5" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17 3v10M13.5 9.5L17 13l3.5-3.5" fill="none" stroke="#ff9b8a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  blacksmith: svg(`
    <path d="M3 13h13c0 2-1.5 3-3.5 3H11v3h3v2H5v-2h3v-3H6.5C4.5 16 3 15 3 13z" fill="#5c6468" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M16 13h5l-3 2z" fill="#5c6468" stroke="${INK}" stroke-width="1"/>
    <path d="M14 3l-5 6" stroke="#7a5430" stroke-width="2" stroke-linecap="round"/><rect x="12" y="1.5" width="6" height="3.5" rx=".6" transform="rotate(35 15 3)" fill="#9aa3a8" stroke="${INK}" stroke-width=".9"/>
    <circle cx="7" cy="10" r="1" fill="#ffb347"/><circle cx="5" cy="9" r=".7" fill="#ffd27a"/>`),
  market: svg(`
    <path d="M3 21v-9h18v9z" fill="#d8c8a0" stroke="${INK}" stroke-width="1.1"/>
    <path d="M2 12l2-6h16l2 6z" fill="#2f5aa0" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M6 6l-1 6M10 6v6M14 6v6M18 6l1 6" stroke="#f1e9d6" stroke-width="1.4"/>
    <circle cx="8" cy="17" r="2.2" fill="#c4572f" stroke="${INK}" stroke-width=".8"/><circle cx="12.5" cy="17.5" r="2" fill="#f5c842" stroke="${INK}" stroke-width=".8"/><circle cx="16.5" cy="17" r="2" fill="#7da34a" stroke="${INK}" stroke-width=".8"/>`),
  university: svg(`
    <path d="M3 21V11h18v10z" fill="#c9c2b2" stroke="${INK}" stroke-width="1.1"/>
    <path d="M1.5 11.5L12 4l10.5 7.5z" fill="#8a5a40" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M6 13v7M10 13v7M14 13v7M18 13v7" stroke="#8a8478" stroke-width="1.6"/>
    <path d="M9 8.5h6l-3 2z" fill="#f1e9d6"/>`),
  ungarrison: svg(`
    <path d="M3 21V9l5-5 5 5v12z" fill="#a8a194" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M6 21v-5a2 2 0 014 0v5z" fill="#2a1a0c"/>
    <path d="M12 15h9M17.5 11.5L21 15l-3.5 3.5" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 15h9M17.5 11.5L21 15l-3.5 3.5" fill="none" stroke="#9cf59a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`),
  lock: svg(`
    <path d="M7 11V8a5 5 0 0110 0v3" fill="none" stroke="${INK}" stroke-width="3.2"/><path d="M7 11V8a5 5 0 0110 0v3" fill="none" stroke="#b8c0c4" stroke-width="1.6"/>
    <rect x="4.5" y="11" width="15" height="10" rx="1.5" fill="#d9b44a" stroke="${INK}" stroke-width="1.2"/>
    <circle cx="12" cy="15.5" r="1.6" fill="${INK}"/><path d="M12 16v3" stroke="${INK}" stroke-width="1.4"/>`),
  palisade_wall: svg(`
    <path d="M3 21V8l1.5-3L6 8v13M8 21V7l1.5-3L11 7v14M13 21V8l1.5-3L16 8v13M18 21V7l1.5-3L21 7v14" fill="#9b6a3c" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M2 12h20M2 17h20" stroke="#5a3a1c" stroke-width="1.2"/>`),
  palisade_gate: svg(`<path d="M3 21V5l2-2 2 2v16M17 21V5l2-2 2 2v16" fill="#9b6a3c" stroke="${INK}" stroke-width="1"/><path d="M7 7h10v14H7z" fill="#7a5430" stroke="${INK}" stroke-width="1"/><path d="M12 7v14" stroke="${INK}" stroke-width="1"/>`),
  stone_wall: svg(`
    <path d="M2 21V9h3V6h3v3h3V6h3v3h3V6h3v3h2v12z" fill="#a8a194" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M2 13h20M2 17h20M7 9v4M13 9v4M19 9v4M4 13v4M10 13v4M16 13v4M7 17v4M13 17v4M19 17v4" stroke="#6f695e" stroke-width=".9"/>`),
  gate: svg(`<path d="M2 21V6h4V3h3v3h6V3h3v3h4v15z" fill="#a8a194" stroke="${INK}" stroke-width="1.1"/><path d="M8 21v-7a4 4 0 018 0v7z" fill="#5a381c" stroke="${INK}" stroke-width="1"/>`),
  watch_tower: svg(`
    <path d="M8 21V9h8v12z" fill="#a8a194" stroke="${INK}" stroke-width="1.1"/>
    <path d="M6 9h12v-3H6z" fill="#7a5430" stroke="${INK}" stroke-width="1"/>
    <path d="M5 6l7-5 7 5z" fill="#8a6a48" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M11 13h2v3h-2z" fill="${INK}"/><path d="M10 21v-3a2 2 0 014 0v3z" fill="#3a2412"/>`),
  castle: svg(`
    <path d="M2 21V10h2V8h2v2h2V8h2v2h4V8h2v2h2V8h2v2h2v11z" fill="#a8a194" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M8 10V4h1.5V2.5h2V4h1v-1.5h2V4H16v6" fill="#b5ae9f" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M12 2.5V0" stroke="${INK}" stroke-width="1"/><path d="M12 0.5h3l-1 1 1 1h-3" fill="#2f5aa0"/>
    <path d="M9.5 21v-4a2.5 2.5 0 015 0v4z" fill="#3a2412"/>`),
  attackGround: svg(`
    <ellipse cx="12" cy="18" rx="9" ry="3.5" fill="none" stroke="${INK}" stroke-width="3"/><ellipse cx="12" cy="18" rx="9" ry="3.5" fill="none" stroke="#ff8a6a" stroke-width="1.4"/>
    <circle cx="12" cy="7" r="4.4" fill="#8a857c" stroke="${INK}" stroke-width="1.2"/><circle cx="10.6" cy="5.6" r="1.2" fill="#c9c4b8"/>
    <path d="M12 12v4" stroke="${INK}" stroke-width="1.4" stroke-dasharray="1.4 1"/>`),
  pack: svg(`<rect x="3" y="12" width="18" height="5" rx="1" fill="#7a5430" stroke="${INK}" stroke-width="1.1"/><circle cx="7" cy="19" r="2.6" fill="#4e331b" stroke="${INK}"/><circle cx="17" cy="19" r="2.6" fill="#4e331b" stroke="${INK}"/><path d="M2 10l20-2" stroke="#a77a45" stroke-width="2.4" stroke-linecap="round"/>`),
  unpack: svg(`<path d="M5 21L12 6l7 15" fill="none" stroke="#7a5430" stroke-width="2.6"/><path d="M3 21h18" stroke="#4e331b" stroke-width="2.4"/><path d="M12 6L3 3M12 6l8 6" stroke="#a77a45" stroke-width="2.2" stroke-linecap="round"/><rect x="17" y="12" width="5" height="5" fill="#5a3a1c" stroke="${INK}"/>`),
  ram: svg(`<path d="M2 15l9-9 9 9z" fill="#8a6038" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M1 13h20" stroke="#6b4626" stroke-width="3" stroke-linecap="round"/><circle cx="22" cy="13" r="1.8" fill="#d9b27a" stroke="${INK}" stroke-width=".8"/><circle cx="6" cy="19" r="2.6" fill="#4e331b" stroke="${INK}"/><circle cx="16" cy="19" r="2.6" fill="#4e331b" stroke="${INK}"/>`),
  mangonel: svg(`<path d="M2 17h20" stroke="#4e331b" stroke-width="3"/><path d="M10 17V9" stroke="#7a5430" stroke-width="2.4"/><path d="M8 15L4 3" stroke="#7a5430" stroke-width="2.2" stroke-linecap="round"/><circle cx="4" cy="3.5" r="2.4" fill="#8a857c" stroke="${INK}"/><circle cx="6" cy="19.5" r="2.4" fill="#4e331b" stroke="${INK}"/><circle cx="18" cy="19.5" r="2.4" fill="#4e331b" stroke="${INK}"/>`),
  scorpion: svg(`<path d="M5 21l7-10 7 10" fill="none" stroke="#7a5430" stroke-width="2"/><path d="M2 10h20" stroke="#4e331b" stroke-width="3"/><path d="M17 2c3 3 3 13 0 16" fill="none" stroke="#8a6038" stroke-width="2"/><path d="M17 2L6 10l11 8" fill="none" stroke="#f1e9d6" stroke-width=".8"/><path d="M20 10l3 0-1.6-1.4" stroke="#c9d1d6" stroke-width="1.4"/>`),
  siege_tower: svg(`<path d="M5 21l1-17h12l1 17z" fill="#8a6440" stroke="${INK}" stroke-width="1.1"/><path d="M6 8h12M6 13h12M6 18h12" stroke="#4e331b" stroke-width="1"/><path d="M18 5l5-3" stroke="#a77a45" stroke-width="2" stroke-linecap="round"/><path d="M12 4V0" stroke="${INK}"/><path d="M12 .5h4l-1 1 1 1h-4" fill="#2f5aa0"/>`),
  trebuchet: svg(`<path d="M4 21L11 7l7 14" fill="none" stroke="#7a5430" stroke-width="2.2"/><path d="M2 21h20" stroke="#4e331b" stroke-width="2.6"/><path d="M11 7L1 2" stroke="#a77a45" stroke-width="2" stroke-linecap="round"/><path d="M11 7l6 4" stroke="#a77a45" stroke-width="2"/><rect x="15" y="11" width="5" height="5" fill="#5a3a1c" stroke="${INK}"/><circle cx="1.5" cy="5" r="1.6" fill="#8a857c"/>`),
  petard: svg(`<circle cx="12" cy="5.5" r="3.2" fill="#e0b48c" stroke="${INK}" stroke-width="1.1"/><path d="M7 21l1.2-8c.4-2 1.8-3 3.8-3s3.4 1 3.8 3L17 21z" fill="#2f5aa0" stroke="${INK}" stroke-width="1.1"/><rect x="7" y="11" width="10" height="9" rx="3" fill="#7a5230" stroke="${INK}" stroke-width="1.1"/><path d="M7 14h10M7 17h10" stroke="#2b2622" stroke-width="1"/><path d="M14 11l2-4" stroke="#d8c9a0"/><circle cx="16.4" cy="6.5" r="1.4" fill="#ffb030"/>`),
  siege_workshop: svg(`<path d="M2 21V10h20v11z" fill="#8a6440" stroke="${INK}" stroke-width="1.1"/><path d="M1 10.5L5 5h14l4 5.5z" fill="#6f5236" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M4 21v-7h10v7z" fill="#140c06"/><circle cx="18" cy="17" r="3" fill="none" stroke="#4e331b" stroke-width="1.6"/><path d="M15 17h6M18 14v6" stroke="#4e331b" stroke-width=".8"/>`),
  aggressive: svg(`
    <path d="M4 20L18 5M20 20L6 5" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M4 20L18 5M20 20L6 5" stroke="#d6dde1" stroke-width="2" stroke-linecap="round"/>
    <path d="M3 16l5 5M21 16l-5 5" stroke="#c8962a" stroke-width="2.2" stroke-linecap="round"/>`),
  defensive: svg(`
    <path d="M12 2l8 3v6c0 5.5-3.5 9-8 11-4.5-2-8-5.5-8-11V5z" fill="#2f5aa0" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12 2v20M4.5 10h15" stroke="#d9b44a" stroke-width="1.6"/>`),
  stand: svg(`
    <path d="M6 22h12" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M6 22h12" stroke="#8a6a44" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M9 22V3" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M9 22V3" stroke="#a77a45" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M10 4h10l-3 4 3 4H10z" fill="#c4572f" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`),
  passive: svg(`
    <path d="M7 22V3" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M7 22V3" stroke="#a77a45" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M8 4c4-2 7 2 13 0v9c-6 2-9-2-13 0z" fill="#f4f1e8" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`),
  barracks: svg(`
    <path d="M2 20v-8h20v8z" fill="#d8c8a0" stroke="${INK}" stroke-width="1.1"/>
    <path d="M1 12.5L5 7h14l4 5.5z" fill="#d1ae5c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M10.5 20v-4a1.5 1.5 0 013 0v4z" fill="#3a2412"/>
    <path d="M17 22l4-6M19 22l-4-6" stroke="#c9d1d6" stroke-width="1.4" stroke-linecap="round"/>
    <rect x="4" y="13" width="3" height="3" fill="#3f6fb0" stroke="${INK}" stroke-width=".6"/>`),
  farm: svg(`
    <path d="M2 21L5 9h14l3 12z" fill="#8a6a42" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <g stroke="#e3c35a" stroke-width="1.3" stroke-linecap="round"><path d="M6 19l1-4M9 19l.5-4M12 19v-4M15 19l-.5-4M18 19l-1-4"/><path d="M6.5 13l.6-2.5M10 13l.3-2.5M13.5 13l-.2-2.5M17 13l-.5-2.5"/></g>`),
  repeat: svg(`
    <path d="M5 11a7 7 0 0112-4.5M19 13a7 7 0 01-12 4.5" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M5 11a7 7 0 0112-4.5M19 13a7 7 0 01-12 4.5" fill="none" stroke="#f1d48a" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M18.5 2.5l-.8 5-4.8-1z" fill="#f1d48a" stroke="${INK}" stroke-width=".9"/><path d="M5.5 21.5l.8-5 4.8 1z" fill="#f1d48a" stroke="${INK}" stroke-width=".9"/>`),
  trash: svg(`
    <path d="M5 7h14l-1.4 14H6.4z" fill="#8a5a30" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M3 6h18" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M9 6V3.5h6V6" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <path d="M9.5 10v8M12 10v8M14.5 10v8" stroke="#2a1606" stroke-width="1.2"/>`),
  reseed: svg(`
    <path d="M12 21V9" stroke="#7d8f3a" stroke-width="1.8"/>
    <path d="M12 9c-3-.5-5-3-5-6 3 0 5 2.5 5 6zM12 13c3-.5 5-3 5-6-3 0-5 2.5-5 6zM12 16c-3-.5-5-3-5-6 3 0 5 2.5 5 6z" fill="#e3c35a" stroke="${INK}" stroke-width="1"/>
    <path d="M4 21h16" stroke="#8a6a42" stroke-width="2.4" stroke-linecap="round"/>`),
  dice: svg(`
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="#f4ead2" stroke="${INK}" stroke-width="1.4"/>
    <circle cx="8" cy="8" r="1.6" fill="${INK}"/><circle cx="16" cy="8" r="1.6" fill="${INK}"/>
    <circle cx="12" cy="12" r="1.6" fill="${INK}"/>
    <circle cx="8" cy="16" r="1.6" fill="${INK}"/><circle cx="16" cy="16" r="1.6" fill="${INK}"/>`),
};

/** Small landscape vignettes for the map-type cards (64x40). */
export const MAP_ICONS = {
  heartland: svg(
    `<rect width="64" height="40" fill="#5b9a3f"/>
     <path d="M0 26C14 24 18 12 32 14s20 14 32 8" stroke="#2b6aa3" stroke-width="6" fill="none"/>
     <path d="M30 10l4 10" stroke="#9fd6dc" stroke-width="4"/>
     <circle cx="12" cy="10" r="4" fill="#2e6a29"/><circle cx="17" cy="8" r="3.4" fill="#36762f"/>
     <circle cx="50" cy="32" r="4" fill="#2e6a29"/><circle cx="55" cy="34" r="3" fill="#36762f"/>`,
    '0 0 64 40',
  ),
  coastal: svg(
    `<rect width="64" height="40" fill="#28689f"/>
     <path d="M0 0h40c-4 8 4 14-2 22s4 12 2 18H0z" fill="#e6d391"/>
     <path d="M0 0h36c-4 8 4 14-2 22s4 12 2 18H0z" fill="#7a9e48"/>
     <path d="M48 12c3-1.5 5 1.5 8 0M46 28c3-1.5 5 1.5 8 0" stroke="#7fb3dc" stroke-width="1.6" fill="none"/>
     <path d="M12 6l4 9h-8z M22 18l4 9h-8z" fill="#245a2e"/>`,
    '0 0 64 40',
  ),
  lakes: svg(
    `<rect width="64" height="40" fill="#4a874b"/>
     <ellipse cx="32" cy="20" rx="17" ry="11" fill="#cfc08a"/>
     <ellipse cx="32" cy="20" rx="15" ry="9.2" fill="#24618f"/>
     <path d="M26 18c3-1.5 5 1.5 8 0" stroke="#6ab4c4" stroke-width="1.5" fill="none"/>
     <path d="M7 6l4 9H3z M57 24l4 9h-8z M52 4l3.5 8h-7z" fill="#1f5a2e"/>`,
    '0 0 64 40',
  ),
  islands: svg(
    `<rect width="64" height="40" fill="#1f74a8"/>
     <ellipse cx="14" cy="12" rx="10" ry="7" fill="#ecdca0"/><ellipse cx="14" cy="12" rx="8" ry="5.4" fill="#62a845"/>
     <ellipse cx="50" cy="28" rx="10" ry="7" fill="#ecdca0"/><ellipse cx="50" cy="28" rx="8" ry="5.4" fill="#62a845"/>
     <ellipse cx="33" cy="21" rx="5" ry="3.6" fill="#ecdca0"/><ellipse cx="33" cy="21" rx="3.6" ry="2.4" fill="#62a845"/>
     <path d="M40 9c3-1.5 5 1.5 8 0M10 31c3-1.5 5 1.5 8 0" stroke="#7fc3e0" stroke-width="1.5" fill="none"/>`,
    '0 0 64 40',
  ),
};

// ---------- technology icons ----------

/** One glyph per technology family. */
const TECH_GLYPH: Record<string, string> = {
  net: `<path d="M3 4c6 3 12 3 18 0v10c-6 4-12 4-18 0z" fill="none" stroke="#6b4626" stroke-width="1.4"/><path d="M3 7c6 3 12 3 18 0M3 10.5c6 3 12 3 18 0M7 5v13M12 6v13M17 5v13" stroke="#d8ccae" stroke-width=".9" fill="none"/><path d="M8 16c2-1.6 5-1.6 7 0-2 1.6-5 1.6-7 0zm7 0l3-1.8v3.6z" fill="#cfd8dc" stroke="${INK}" stroke-width=".7"/>`,
  hull: `<path d="M2 9h20l-3 9H5z" fill="#7a5230" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><path d="M3 12h18M4 15h16" stroke="#4e331b" stroke-width=".9"/><path d="M14 3l6 6-2 2-6-6z" fill="#9aa3a8" stroke="${INK}" stroke-width=".9"/>`,
  drydock: `<path d="M2 21V9M22 21V9" stroke="#6b4626" stroke-width="2"/><path d="M2 12h20" stroke="#4e331b" stroke-width="1.2"/><path d="M4 15h16l-3 5H7z" fill="#7a5230" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 15V5M12 6l6 7h-6z" stroke="${INK}" stroke-width="1" fill="#efe6cc"/>`,
  adze: `<path d="M4 20l12-12" stroke="#7a5430" stroke-width="2.4" stroke-linecap="round"/><path d="M13 4c3-1 6 0 7 3l-3 1-3-3z" fill="#c9d1d6" stroke="${INK}" stroke-width="1.1"/><path d="M2 21h10" stroke="#8a6038" stroke-width="2.6" stroke-linecap="round"/>`,
  hotshot: `<path d="M3 21L17 7" stroke="#7a5430" stroke-width="2" stroke-linecap="round"/><path d="M17 7l4-4-1 5z" fill="#c9d1d6" stroke="${INK}" stroke-width=".9"/><path d="M14 12c-3-1-3-5 0-8 0 3 4 3 3 6-.3 1.3-1.6 2.3-3 2z" fill="#f08a24" stroke="${INK}" stroke-width=".8"/>`,
  axe: `<path d="M6 21L16 7" stroke="#7a5430" stroke-width="2.2" stroke-linecap="round"/><path d="M13 4c3 0 6 2 7 5l-4 2-4-5z" fill="#c9d1d6" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`,
  saw: `<path d="M3 15l14-8 3 5-14 8z" fill="#c9d1d6" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M5 18l1-2 1.5 1 1-2 1.5 1 1-2 1.5 1 1-2 1.5 1" fill="none" stroke="${INK}" stroke-width=".8"/><path d="M17 7l3-3 2 3-2 5" fill="#7a5430" stroke="${INK}" stroke-width="1"/>`,
  pick: `<path d="M12 21V8" stroke="#7a5430" stroke-width="2.2" stroke-linecap="round"/><path d="M3 9c4-4 14-4 18 0-5-2-13-2-18 0z" fill="#9aa3a8" stroke="${INK}" stroke-width="1.1"/>`,
  gold: `<path d="M12 21V8" stroke="#7a5430" stroke-width="2.2" stroke-linecap="round"/><path d="M3 9c4-4 14-4 18 0-5-2-13-2-18 0z" fill="#9aa3a8" stroke="${INK}" stroke-width="1.1"/><circle cx="17" cy="17" r="3.4" fill="#f5c842" stroke="${INK}" stroke-width="1"/>`,
  stone: `<path d="M12 21V8" stroke="#7a5430" stroke-width="2.2" stroke-linecap="round"/><path d="M3 9c4-4 14-4 18 0-5-2-13-2-18 0z" fill="#9aa3a8" stroke="${INK}" stroke-width="1.1"/><path d="M14 20l1-4 4-1 2 3-2 3z" fill="#b8b8b0" stroke="${INK}" stroke-width="1"/>`,
  plow: `<path d="M3 8h9l5 6" fill="none" stroke="#7a5430" stroke-width="2" stroke-linecap="round"/><path d="M14 12l7 4-4 4-5-3z" fill="#9aa3a8" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M2 21h12" stroke="#6b4a2a" stroke-width="1.6"/>`,
  collar: `<path d="M6 19c-2-6 0-14 6-14s8 8 6 14" fill="none" stroke="${INK}" stroke-width="5"/><path d="M6 19c-2-6 0-14 6-14s8 8 6 14" fill="none" stroke="#8a5a30" stroke-width="3"/><circle cx="12" cy="5" r="1.6" fill="#d9b44a"/>`,
  barrow: `<path d="M4 11h12l-2 6H6z" fill="#8a5a30" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><circle cx="16.5" cy="18" r="3" fill="#6b4a2a" stroke="${INK}" stroke-width="1"/><path d="M4 11L1 9M16 11l5-4" stroke="#6b4a2a" stroke-width="1.6" stroke-linecap="round"/>`,
  cart: `<path d="M2 9h16v7H2z" fill="#8a5a30" stroke="${INK}" stroke-width="1.1"/><circle cx="6" cy="18" r="3" fill="#6b4a2a" stroke="${INK}" stroke-width="1"/><circle cx="14" cy="18" r="3" fill="#6b4a2a" stroke="${INK}" stroke-width="1"/><path d="M18 11l4-2" stroke="#6b4a2a" stroke-width="1.6"/>`,
  loom: `<ellipse cx="12" cy="12" rx="4" ry="8" fill="#e8dcc0" stroke="${INK}" stroke-width="1.1"/><path d="M8 8h8M8 12h8M8 16h8" stroke="#b8a37a" stroke-width="1"/><path d="M12 2v20" stroke="#7a5430" stroke-width="1.6"/>`,
  watch: `<path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z" fill="#f1e9d6" stroke="${INK}" stroke-width="1.2"/><circle cx="12" cy="12" r="3.6" fill="#2f5aa0" stroke="${INK}" stroke-width="1"/><circle cx="11" cy="11" r="1" fill="#fff"/>`,
  sword: `<path d="M5 19L17 5" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/><path d="M5 19L17 5" stroke="#d6dde1" stroke-width="1.8" stroke-linecap="round"/><path d="M4 15l5 5" stroke="#c8962a" stroke-width="2.2" stroke-linecap="round"/>`,
  arrow: `<path d="M4 20L18 6" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/><path d="M4 20L18 6" stroke="#c9a46a" stroke-width="1.2"/><path d="M15 4l6-1-1 6z" fill="#c9d1d6" stroke="${INK}" stroke-width="1"/><path d="M4 20l-1-4M4 20l4 1" stroke="#f1e9d6" stroke-width="1.6"/>`,
  mail: `<path d="M6 5h12l2 5-2 1v9H6v-9l-2-1z" fill="#9aa3a8" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 9h8M8 12h8M8 15h8M8 18h8" stroke="#5c6468" stroke-width=".9" stroke-dasharray="1.2 1"/>`,
  barding: `<path d="M3 17c0-3 2-5 6-5h6l3-4 3 1-2 5v4" fill="#8f8a84" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M3 13h14v5H3z" fill="#9aa3a8" stroke="${INK}" stroke-width=".9"/><path d="M5 14.5h10M5 16.5h10" stroke="#5c6468" stroke-width=".8" stroke-dasharray="1.2 1"/>`,
  padding: `<path d="M12 2l8 3v6c0 5.5-3.5 9-8 11-4.5-2-8-5.5-8-11V5z" fill="#a8885a" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><path d="M6 9h12M6 13h12M7 17h10" stroke="#6b4a2a" stroke-width=".9"/>`,
  masonry: `<path d="M2 20h20M2 15h20M2 10h20" stroke="${INK}" stroke-width="1"/><path d="M2 10h20v10H2z" fill="#b8b0a2" stroke="${INK}" stroke-width="1.1"/><path d="M8 10v5M16 10v5M5 15v5M12 15v5M19 15v5" stroke="${INK}" stroke-width="1"/><path d="M15 3l4 4-2 2-4-4z" fill="#9aa3a8" stroke="${INK}" stroke-width=".9"/>`,
  crane: `<path d="M5 21V4h2v17zM7 5h13" stroke="#7a5430" stroke-width="2" stroke-linecap="round"/><path d="M18 5v8" stroke="${INK}" stroke-width="1"/><rect x="15.5" y="13" width="5" height="4" fill="#b8b0a2" stroke="${INK}" stroke-width="1"/><circle cx="6" cy="16" r="4" fill="none" stroke="#6b4a2a" stroke-width="1.6"/>`,
};

const TECH_GLYPH_OF: Record<string, string> = {
  gillnets: 'net',
  careening: 'hull',
  dry_dock: 'drydock',
  shipwright: 'adze',
  heated_shot: 'hotshot',
  siege_engineers: 'crane',
  ballistics: 'arrow',
  sappers: 'pick',
  fortified_wall: 'masonry',
  architecture: 'crane',
  hoardings: 'masonry',
  murder_holes: 'arrow',
  arrowslits: 'arrow',
  loom: 'loom',
  town_watch: 'watch',
  wheelbarrow: 'barrow',
  hand_cart: 'cart',
  double_bit_axe: 'axe',
  bow_saw: 'saw',
  gold_mining: 'gold',
  gold_shaft: 'gold',
  stone_mining: 'stone',
  horse_collar: 'collar',
  heavy_plow: 'plow',
  forging: 'sword',
  iron_casting: 'sword',
  fletching: 'arrow',
  bodkin_arrow: 'arrow',
  scale_mail: 'mail',
  chain_mail: 'mail',
  scale_barding: 'barding',
  chain_barding: 'barding',
  padded_archer: 'padding',
  leather_archer: 'padding',
  masonry: 'masonry',
  treadmill_crane: 'crane',
};
/** Second-level techs show two pips. */
const LEVEL2 = new Set(['iron_casting', 'bodkin_arrow', 'chain_mail', 'chain_barding', 'leather_archer', 'bow_saw', 'gold_shaft', 'heavy_plow', 'hand_cart']);
const UPGRADE_OF: Record<string, string> = { capped_ram: 'ram', onager: 'mangonel', guard_tower: 'watch_tower', keep: 'watch_tower', swordsman: 'militia', pikeman: 'spearman', crossbowman: 'archer', light_cavalry: 'scout', war_galley: 'galley' };
const NUMERAL: Record<string, string> = { age2: 'II', age3: 'III', age4: 'IV' };

const cacheTech = new Map<string, string>();

/** Icon for a technology: its tool or armour, a unit with a gold chevron for upgrades, or a crown for ages. */
export function techIcon(id: string): string {
  let out = cacheTech.get(id);
  if (out) return out;
  if (NUMERAL[id]) {
    out = svg(`
      <path d="M3 17l1.5-10 4.5 4.5L12 4l3 7.5L19.5 7 21 17z" fill="#f5c842" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
      <rect x="3" y="17" width="18" height="4" rx="1" fill="#d9a62a" stroke="${INK}" stroke-width="1.1"/>
      <text x="12" y="16" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="${NUMERAL[id].length > 2 ? 6 : 7}" fill="${INK}">${NUMERAL[id]}</text>`);
  } else if (UPGRADE_OF[id]) {
    const base = (ICONS as Record<string, string>)[UPGRADE_OF[id]].replace(/^<svg[^>]*>|<\/svg>$/g, '');
    out = svg(`${base}<path d="M15 9l4-4 4 4" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 9l4-4 4 4" fill="none" stroke="#f5c842" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
  } else {
    const pips = LEVEL2.has(id) ? 2 : 1;
    const dots = Array.from({ length: pips }, (_, k) => `<circle cx="${20 - k * 4}" cy="20.5" r="1.6" fill="#f5c842" stroke="${INK}" stroke-width=".7"/>`).join('');
    out = svg(`${TECH_GLYPH[TECH_GLYPH_OF[id]] ?? TECH_GLYPH.sword}${dots}`);
  }
  cacheTech.set(id, out);
  return out;
}
