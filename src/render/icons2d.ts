// Small screen-space emblems drawn over the map and the minimap: the
// Commander's star and intel drives.

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.42 : r;
    if (k) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

/** The Commander's insignia, a gold star on a dark disc, centred on (x, y), r across half its width. */
export function drawCommanderIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.fillStyle = 'rgba(10,16,24,0.85)';
  g.beginPath();
  g.arc(x, y, r * 1.05, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffd34a';
  g.lineWidth = Math.max(1, r * 0.12);
  g.stroke();
  star(g, x, y + r * 0.04, r * 0.78);
  const gold = g.createLinearGradient(x - r, y - r, x + r, y + r);
  gold.addColorStop(0, '#fff2b0');
  gold.addColorStop(0.5, '#ffd34a');
  gold.addColorStop(1, '#c08a10');
  g.fillStyle = gold;
  g.fill();
  g.restore();
}

/** An intel drive: a black rugged case with a glowing cyan status light. */
export function drawIntelIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.fillStyle = '#1c2026';
  g.strokeStyle = 'rgba(0,0,0,0.9)';
  g.lineWidth = Math.max(1, r * 0.14);
  g.beginPath();
  g.roundRect(x - r, y - r * 0.7, r * 2, r * 1.4, r * 0.25);
  g.fill();
  g.stroke();
  // Handle, latches and the glowing light.
  g.strokeStyle = '#4a525c';
  g.lineWidth = Math.max(1, r * 0.2);
  g.beginPath();
  g.moveTo(x - r * 0.4, y - r * 0.7);
  g.lineTo(x - r * 0.4, y - r * 1.05);
  g.lineTo(x + r * 0.4, y - r * 1.05);
  g.lineTo(x + r * 0.4, y - r * 0.7);
  g.stroke();
  g.fillStyle = '#9aa3ab';
  g.fillRect(x - r * 0.8, y - r * 0.15, r * 0.3, r * 0.3);
  g.fillRect(x + r * 0.5, y - r * 0.15, r * 0.3, r * 0.3);
  const glow = g.createRadialGradient(x, y + r * 0.25, 0, x, y + r * 0.25, r * 0.7);
  glow.addColorStop(0, 'rgba(120,240,255,1)');
  glow.addColorStop(1, 'rgba(60,200,255,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(x, y + r * 0.25, r * 0.7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d8fbff';
  g.fillRect(x - r * 0.25, y + r * 0.18, r * 0.5, r * 0.14);
  g.restore();
}
