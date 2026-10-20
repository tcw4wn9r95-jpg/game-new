// The Steel & Signal emblem and wordmark: a chamfered steel shield holding a
// radar scope with a sweeping beam, signal arcs and a star, under rank
// chevrons. Drawn as SVG so it stays sharp from the menu title to the splash
// screen and the app icon.

let uid = 0;

/** The emblem as SVG markup. `animated` sweeps the radar and pulses the signal (CSS in ui.css). */
export function emblemSvg(opts: { animated?: boolean; className?: string } = {}): string {
  const p = `em${uid++}`;
  return `<svg class="emblem ${opts.animated ? 'emblem-live' : ''} ${opts.className ?? ''}" viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${p}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e9fbff"/><stop offset=".35" stop-color="#9fb4c2"/><stop offset=".7" stop-color="#55687a"/><stop offset="1" stop-color="#2a3644"/>
    </linearGradient>
    <linearGradient id="${p}f" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#11324a"/><stop offset=".55" stop-color="#0a1e30"/><stop offset="1" stop-color="#050d17"/>
    </linearGradient>
    <radialGradient id="${p}glow" cx=".5" cy=".55" r=".5">
      <stop offset="0" stop-color="#38d6ff" stop-opacity=".55"/><stop offset="1" stop-color="#0a8fd0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${p}sw" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#38d6ff" stop-opacity="0"/><stop offset="1" stop-color="#7fe9ff" stop-opacity=".85"/>
    </linearGradient>
    <linearGradient id="${p}st" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff4c4"/><stop offset=".5" stop-color="#ffc83a"/><stop offset="1" stop-color="#d0870a"/>
    </linearGradient>
    <clipPath id="${p}c"><path d="M30 40h60l14 14v40c0 22-18 38-44 50-26-12-44-28-44-50V54z"/></clipPath>
  </defs>
  <!-- Rank chevrons above the shield -->
  <g fill="url(#${p}g)" stroke="#04070b" stroke-width="1.2" stroke-linejoin="round">
    <path d="M22 26l38-18 38 18v8L60 16 22 34z"/>
    <path d="M30 36l30-14 30 14v7L60 29 30 43z"/>
  </g>
  <!-- The shield: steel rim, deep navy field -->
  <path d="M28 36h64l16 16v42c0 26-21 43-48 56-27-13-48-30-48-56V52z" fill="url(#${p}g)" stroke="#04070b" stroke-width="1.6"/>
  <path d="M30 40h60l14 14v40c0 22-18 38-44 50-26-12-44-28-44-50V54z" fill="url(#${p}f)"/>
  <g clip-path="url(#${p}c)">
    <ellipse cx="60" cy="90" rx="44" ry="44" fill="url(#${p}glow)" class="em-glow"/>
    <!-- Radar scope: rings, cross-hairs and a sweeping beam -->
    <g fill="none" stroke="#38d6ff" stroke-opacity=".45" stroke-width="1">
      <circle cx="60" cy="90" r="12"/><circle cx="60" cy="90" r="24"/><circle cx="60" cy="90" r="36"/>
      <path d="M60 50v80M20 90h80"/>
    </g>
    <g class="em-flame em-flame-a"><path d="M60 90L96 74A40 40 0 0 1 100 90z" fill="url(#${p}sw)"/></g>
    <!-- Contacts on the scope -->
    <g class="em-gems">
      <circle cx="82" cy="78" r="2.4" fill="#7fe9ff"/><circle cx="38" cy="104" r="2" fill="#ff5a4a"/><circle cx="46" cy="70" r="1.8" fill="#7fe9ff"/>
    </g>
    <!-- Signal arcs from the star -->
    <g class="em-flame em-flame-b" fill="none" stroke="#bff4ff" stroke-width="2.2" stroke-linecap="round">
      <path d="M44 72a22 22 0 0 0 0 36M76 72a22 22 0 0 1 0 36"/>
      <path d="M37 64a32 32 0 0 0 0 52M83 64a32 32 0 0 1 0 52" stroke-opacity=".55"/>
    </g>
    <!-- The star -->
    <path d="M60 74l4.7 10.6 11.5 1.2-8.6 7.7 2.5 11.3L60 99l-10.1 5.8 2.5-11.3-8.6-7.7 11.5-1.2z" fill="url(#${p}st)" stroke="#04070b" stroke-width="1"/>
  </g>
  <!-- Inner rule -->
  <path d="M30 40h60l14 14v40c0 22-18 38-44 50-26-12-44-28-44-50V54z" fill="none" stroke="#7fe9ff" stroke-opacity=".6" stroke-width="1"/>
  <path d="M30 40h60" stroke="#e9fbff" stroke-opacity=".7" stroke-width=".9"/>
</svg>`;
}

/** "Steel & Signal" in brushed steel, the ampersand lit like a signal. */
export function wordmarkHtml(className = ''): string {
  return `<span class="wordmark ${className}"><span class="wm-word">Steel</span><span class="wm-amp">&amp;</span><span class="wm-word">Signal</span></span>`;
}
