// Small screen-space emblems drawn over the map and the minimap: the King's
// crown and relics.

/** A gold crown centred on (x, y), r across half its width. */
export function drawCrownIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.beginPath();
  g.moveTo(x - r, y + r * 0.55);
  g.lineTo(x - r, y - r * 0.45);
  g.lineTo(x - r * 0.55, y + r * 0.05);
  g.lineTo(x, y - r * 0.75);
  g.lineTo(x + r * 0.55, y + r * 0.05);
  g.lineTo(x + r, y - r * 0.45);
  g.lineTo(x + r, y + r * 0.55);
  g.closePath();
  const gold = g.createLinearGradient(x - r, y, x + r, y);
  gold.addColorStop(0, '#b58a1c');
  gold.addColorStop(0.45, '#ffe58a');
  gold.addColorStop(1, '#9a7212');
  g.fillStyle = gold;
  g.fill();
  g.strokeStyle = 'rgba(40,24,0,0.85)';
  g.lineWidth = Math.max(1, r * 0.14);
  g.stroke();
  g.fillStyle = '#c0262c';
  g.beginPath();
  g.arc(x, y + r * 0.2, r * 0.16, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A relic: a gilded casket with a cross on its lid. */
export function drawRelicIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.fillStyle = '#c8962a';
  g.strokeStyle = 'rgba(40,24,0,0.9)';
  g.lineWidth = Math.max(1, r * 0.15);
  g.beginPath();
  g.rect(x - r, y - r * 0.4, r * 2, r * 1.2);
  g.fill();
  g.stroke();
  // Pitched lid.
  g.fillStyle = '#f0cf5a';
  g.beginPath();
  g.moveTo(x - r * 1.1, y - r * 0.4);
  g.lineTo(x - r * 0.6, y - r);
  g.lineTo(x + r * 0.6, y - r);
  g.lineTo(x + r * 1.1, y - r * 0.4);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = '#fff6d8';
  g.lineWidth = Math.max(1, r * 0.18);
  g.beginPath();
  g.moveTo(x, y - r * 0.2);
  g.lineTo(x, y + r * 0.6);
  g.moveTo(x - r * 0.3, y + r * 0.1);
  g.lineTo(x + r * 0.3, y + r * 0.1);
  g.stroke();
  g.restore();
}
