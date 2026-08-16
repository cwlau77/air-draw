export interface DebugInfo {
  fps: number;
  pinchRatio: number | null;
  pinching: boolean;
  drawing: boolean;
}

export class DebugOverlay {
  private ctx: CanvasRenderingContext2D;
  private visible = true;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable for overlay canvas");
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.canvas.hidden = !v;
    // Hiding the canvas zeroes clientWidth/clientHeight, which resize() reads to set
    // the backing store. Without this, toggling off then resizing the window leaves
    // the backing store at 0x0, and it is never restored until the next resize while
    // visible — so the overlay would stay blank forever after toggling back on.
    if (v) this.resize();
  }

  isVisible(): boolean {
    return this.visible;
  }

  draw(landmarks: { x: number; y: number }[] | null, info: DebugInfo): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.visible) return;

    // Mirroring convention: this canvas is mirrored in CSS identically to the video,
    // so normalized landmark coords map directly with no flip here.
    if (landmarks) {
      ctx.fillStyle = "#0f0";
      for (const lm of landmarks) {
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Text must be un-mirrored or it renders backwards under the CSS flip.
    ctx.save();
    ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
    ctx.fillStyle = info.pinching ? "#ff0" : "#eee";
    ctx.font = "14px ui-monospace, monospace";
    const ratio = info.pinchRatio === null ? "--" : info.pinchRatio.toFixed(3);
    ctx.fillText(`fps ${info.fps.toFixed(0)}`, 12, 24);
    ctx.fillText(`pinch ratio ${ratio}`, 12, 44);
    ctx.fillText(`pinching ${info.pinching}`, 12, 64);
    ctx.fillText(`drawing ${info.drawing}`, 12, 104);
    ctx.fillText(landmarks ? "hand: present" : "hand: none", 12, 124);
    ctx.restore();
  }
}
