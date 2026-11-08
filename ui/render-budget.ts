/** Hysteresis avoids quality flicker; only sustained slow render work reduces resolution. */
export class RenderBudget {
  readonly maximum: number;
  ratio: number;
  private samples = 0;
  private total = 0;
  private fastWindows = 0;
  constructor(maximum: number) {
    this.maximum = Number.isFinite(maximum) ? Math.min(2, Math.max(0.5, maximum)) : 1;
    this.ratio = this.maximum;
  }
  sample(milliseconds: number): number | undefined {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
    this.total += milliseconds;
    if (++this.samples < 120) return;
    const mean = this.total / this.samples;
    this.total = 0;
    this.samples = 0;
    const minimum = Math.min(0.75, this.maximum);
    let next = this.ratio;
    if (mean > 22) {
      next = Math.max(minimum, this.ratio * 0.85);
      this.fastWindows = 0;
    } else if (mean < 6 && ++this.fastWindows >= 2) {
      next = Math.min(this.maximum, this.ratio / 0.85);
      this.fastWindows = 0;
    } else if (mean >= 6) this.fastWindows = 0;
    if (Math.abs(next - this.ratio) < 0.01) return;
    this.ratio = next;
    return next;
  }
}
