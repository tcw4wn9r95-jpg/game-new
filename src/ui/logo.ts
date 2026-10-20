// The Hearth & Crown emblem and wordmark: a heater shield bearing a stone
// hearth with a living fire, crowned, over crossed swords. Drawn as SVG so it
// stays sharp from the menu title to the splash screen and the app icon.

let uid = 0;

/** The emblem as SVG markup. `animated` lets the fire flicker and the gems glint (CSS in ui.css). */
export function emblemSvg(opts: { animated?: boolean; className?: string } = {}): string {
  const p = `em${uid++}`;
  return `<svg class="emblem ${opts.animated ? 'emblem-live' : ''} ${opts.className ?? ''}" viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${p}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff2b8"/><stop offset=".35" stop-color="#e8b84a"/><stop offset=".7" stop-color="#b07c22"/><stop offset="1" stop-color="#6e4810"/>
    </linearGradient>
    <linearGradient id="${p}f" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2c4f8c"/><stop offset=".55" stop-color="#1a3060"/><stop offset="1" stop-color="#0d1a38"/>
    </linearGradient>
    <linearGradient id="${p}s" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8b959b"/><stop offset=".45" stop-color="#f4f8fa"/><stop offset="1" stop-color="#6d777d"/>
    </linearGradient>
    <radialGradient id="${p}glow" cx=".5" cy=".72" r=".45">
      <stop offset="0" stop-color="#ffb347" stop-opacity=".75"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${p}fl" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ff5a14"/><stop offset=".5" stop-color="#ff9a24"/><stop offset="1" stop-color="#ffe066"/>
    </linearGradient>
    <clipPath id="${p}c"><path d="M18 46h84v34c0 30-18 50-42 62-24-12-42-32-42-62z"/></clipPath>
  </defs>
  <!-- Crossed swords behind the shield -->
  <g stroke="#1b0f05" stroke-width="1.2">
    <path d="M8 22l92 112 3-3L12 18z" fill="url(#${p}s)"/>
    <path d="M112 22L20 134l-3-3L108 18z" fill="url(#${p}s)"/>
    <path d="M4 34l12-12 4 4-12 12z M116 34l-12-12-4 4 12 12z" fill="url(#${p}g)"/>
    <circle cx="5" cy="17" r="3.6" fill="url(#${p}g)"/><circle cx="115" cy="17" r="3.6" fill="url(#${p}g)"/>
  </g>
  <!-- The shield: gold rim, blue field -->
  <path d="M14 42h92v38c0 34-21 56-46 68-25-12-46-34-46-68z" fill="url(#${p}g)" stroke="#1b0f05" stroke-width="1.6"/>
  <path d="M18 46h84v34c0 30-18 50-42 62-24-12-42-32-42-62z" fill="url(#${p}f)"/>
  <g clip-path="url(#${p}c)">
    <!-- Faint diaper pattern on the field -->
    <path d="M18 60l42 42 42-42M18 84l42 42 42-42M18 108l42 42 42-42" fill="none" stroke="#ffffff" stroke-opacity=".06" stroke-width="1"/>
    <!-- Firelight -->
    <ellipse cx="60" cy="112" rx="40" ry="34" fill="url(#${p}glow)" class="em-glow"/>
    <!-- The hearth: a stone arch over a fire -->
    <path d="M32 136V100c0-17 12-28 28-28s28 11 28 28v36z" fill="#7b7468" stroke="#1b0f05" stroke-width="1.2"/>
    <path d="M40 136v-34c0-12 9-20 20-20s20 8 20 20v34z" fill="#1d1208"/>
    <g fill="none" stroke="#4d473e" stroke-width="1.1">
      <path d="M32 112h8M80 112h8M32 124h8M80 124h8M36 92l6 4M84 92l-6 4M47 77l4 7M73 77l-4 7M60 72v10"/>
    </g>
    <g class="em-fire">
      <path class="em-flame em-flame-a" d="M60 134c-13 0-17-9-13-18 3-7 9-9 8-19 7 5 13 12 12 21 4-3 4-8 4-11 6 7 6 14 3 19-2 5-7 8-14 8z" fill="url(#${p}fl)"/>
      <path class="em-flame em-flame-b" d="M60 134c-7 0-10-5-8-10 2-4 5-6 5-12 5 4 8 9 7 14 2-1 3-3 3-5 3 4 3 8 1 10-1 2-4 3-8 3z" fill="#ffe680"/>
    </g>
    <!-- Logs -->
    <path d="M44 133l32-5M44 128l32 5" stroke="#5a3a1c" stroke-width="3.2" stroke-linecap="round"/>
  </g>
  <!-- Inner gold rule -->
  <path d="M18 46h84v34c0 30-18 50-42 62-24-12-42-32-42-62z" fill="none" stroke="#f6df98" stroke-opacity=".55" stroke-width="1"/>
  <!-- The crown -->
  <g stroke="#1b0f05" stroke-width="1.4" stroke-linejoin="round">
    <path d="M28 44l-4-26 15 12 9-22 12 18 12-18 9 22 15-12-4 26z" fill="url(#${p}g)"/>
    <path d="M27 40h66v8H27z" fill="url(#${p}g)"/>
    <circle cx="24" cy="16" r="3.4" fill="url(#${p}g)"/><circle cx="48" cy="7" r="3.4" fill="url(#${p}g)"/><circle cx="72" cy="7" r="3.4" fill="url(#${p}g)"/><circle cx="96" cy="16" r="3.4" fill="url(#${p}g)"/>
    <circle cx="60" cy="25" r="4" fill="url(#${p}g)"/>
  </g>
  <g class="em-gems" stroke="#1b0f05" stroke-width=".8">
    <rect x="56.5" y="40.5" width="7" height="7" transform="rotate(45 60 44)" fill="#c0262c"/>
    <circle cx="40" cy="44" r="2.6" fill="#2a64c8"/><circle cx="80" cy="44" r="2.6" fill="#2a64c8"/>
    <circle cx="31" cy="44" r="1.8" fill="#3d9a4a"/><circle cx="89" cy="44" r="1.8" fill="#3d9a4a"/>
  </g>
  <path d="M30 41.5h60" stroke="#fff6d8" stroke-opacity=".7" stroke-width=".9"/>
</svg>`;
}

/** "Hearth & Crown" in engraved gold, the ampersand as a flourish of flame. */
export function wordmarkHtml(className = ''): string {
  return `<span class="wordmark ${className}"><span class="wm-word">Hearth</span><span class="wm-amp">&amp;</span><span class="wm-word">Crown</span></span>`;
}
