/**
 * HydroSense – Adaptive Jitter Smoothing Filter for Ultrasonic Water Levels
 *
 * Suppresses ultrasonic sensor noise (ripples, flutter) while
 * responding promptly to genuine level changes (refilling or draining).
 */

export class WaterLevelSmoother {
  private smoothedValue: number | null = null;

  public update(rawWater: number): number {
    if (isNaN(rawWater)) return this.smoothedValue ?? 0;

    // First reading initialization
    if (this.smoothedValue === null) {
      this.smoothedValue = Math.min(100, Math.max(0, Math.round(rawWater * 10) / 10));
      return this.smoothedValue;
    }

    const delta = Math.abs(rawWater - this.smoothedValue);

    // Adaptive alpha coefficient:
    // - Very small flutter (< 1.5%): alpha = 0.25 (smooths acoustic noise)
    // - Moderate change (1.5% - 4%): alpha = 0.65 (balanced tracking)
    // - Large real change (> 4%): alpha = 0.95 (instant responsive tracking)
    let alpha = 0.25;
    if (delta > 4.0) {
      alpha = 0.95;
    } else if (delta > 1.5) {
      alpha = 0.65;
    }

    const newSmoothed = this.smoothedValue + alpha * (rawWater - this.smoothedValue);
    this.smoothedValue = Math.min(100, Math.max(0, Math.round(newSmoothed * 10) / 10));

    return this.smoothedValue;
  }

  public reset(): void {
    this.smoothedValue = null;
  }

  public get(): number | null {
    return this.smoothedValue;
  }
}
