/** Frame counter shown in the HUD; updates twice a second to stay readable. */
export class FpsCounter {
  private frames = 0;
  private since = performance.now();

  constructor(private el: HTMLElement) {}

  frame(now: number): void {
    this.frames++;
    const dt = now - this.since;
    if (dt >= 500) {
      this.el.textContent = `${Math.round((this.frames * 1000) / dt)} fps`;
      this.frames = 0;
      this.since = now;
    }
  }
}
