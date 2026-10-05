/**
 * HydroSense – Water Usage & History Tracking Service
 *
 * Technical Requirements:
 * - Do NOT invent consumption data.
 * - History is built strictly from actual timestamped received LEVEL values.
 * - Usage is estimated only from actual recorded level changes.
 * - If there is not enough data, report not enough data.
 */

export interface LevelSample {
  timestamp: number;
  level: number;       // Water level percentage 0-100%
  liters: number;      // Calculated litres at this timestamp
}

export interface DayUsageRecord {
  date: string;        // 'YYYY-MM-DD'
  consumedLiters: number;
  refillsLiters: number;
  samplesCount: number;
}

export interface UsageStoreData {
  samples: LevelSample[];
  dailyRecords: Record<string, DayUsageRecord>;
  lastLevel: number | null;
  lastTimestamp: number | null;
}

const STORAGE_KEY = 'hydrosense_genuine_usage_v4';

export function formatDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export class WaterUsageTracker {
  private store: UsageStoreData;

  constructor() {
    this.store = this.loadFromStorage();
  }

  private loadFromStorage(): UsageStoreData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.samples)) {
          return parsed;
        }
      }
    } catch {}

    // Strictly start with empty historical data - NEVER invent fake consumption
    return {
      samples: [],
      dailyRecords: {},
      lastLevel: null,
      lastTimestamp: null,
    };
  }

  private saveToStorage(): void {
    try {
      // Keep up to 2000 recent samples to maintain fast storage performance
      if (this.store.samples.length > 2000) {
        this.store.samples = this.store.samples.slice(-1500);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.store));
    } catch {}
  }

  /**
   * Process a genuine, verified incoming water reading from Arduino
   */
  public processWaterReading(level: number, tankCapacityLiters: number): void {
    if (level < 0 || level > 100 || isNaN(level)) return;

    const now = Date.now();
    const liters = Math.round(((level / 100) * tankCapacityLiters) * 10) / 10;
    const dateKey = formatDateKey(new Date(now));

    // Record timestamped sample (throttle to 1 sample every 10 seconds unless level changes noticeably)
    const lastSample = this.store.samples[this.store.samples.length - 1];
    const shouldRecordSample =
      !lastSample ||
      now - lastSample.timestamp >= 15000 ||
      Math.abs(lastSample.level - level) >= 0.5;

    if (shouldRecordSample) {
      this.store.samples.push({
        timestamp: now,
        level: Math.round(level * 10) / 10,
        liters,
      });
    }

    // Estimate consumption strictly from genuine level decreases (drops > 0.4%)
    if (this.store.lastLevel !== null && this.store.lastTimestamp !== null) {
      const deltaPercent = this.store.lastLevel - level;

      if (!this.store.dailyRecords[dateKey]) {
        this.store.dailyRecords[dateKey] = {
          date: dateKey,
          consumedLiters: 0,
          refillsLiters: 0,
          samplesCount: 0,
        };
      }
      this.store.dailyRecords[dateKey].samplesCount++;

      // Meaningful decrease = consumption (filter noise)
      if (deltaPercent >= 0.4 && deltaPercent <= 50.0) {
        const consumed = (deltaPercent / 100) * tankCapacityLiters;
        this.store.dailyRecords[dateKey].consumedLiters =
          Math.round((this.store.dailyRecords[dateKey].consumedLiters + consumed) * 10) / 10;
      }
      // Meaningful increase = refill
      else if (deltaPercent <= -1.0) {
        const refilled = (Math.abs(deltaPercent) / 100) * tankCapacityLiters;
        this.store.dailyRecords[dateKey].refillsLiters =
          Math.round((this.store.dailyRecords[dateKey].refillsLiters + refilled) * 10) / 10;
      }
    }

    this.store.lastLevel = level;
    this.store.lastTimestamp = now;
    this.saveToStorage();
  }

  public getSamples(filter: 'today' | '7days' | '30days'): LevelSample[] {
    const now = Date.now();
    let cutoff = 0;

    if (filter === 'today') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      cutoff = startOfDay.getTime();
    } else if (filter === '7days') {
      cutoff = now - 7 * 24 * 60 * 60 * 1000;
    } else if (filter === '30days') {
      cutoff = now - 30 * 24 * 60 * 60 * 1000;
    }

    return this.store.samples.filter((s) => s.timestamp >= cutoff);
  }

  public getConsumedForFilter(filter: 'today' | '7days' | '30days'): number {
    const now = new Date();
    let total = 0;

    const daysCount = filter === 'today' ? 1 : filter === '7days' ? 7 : 30;
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = formatDateKey(d);
      const rec = this.store.dailyRecords[key];
      if (rec) {
        total += rec.consumedLiters;
      }
    }

    return Math.round(total * 10) / 10;
  }

  public getTodayRefills(): number {
    const todayKey = formatDateKey(new Date());
    return this.store.dailyRecords[todayKey]?.refillsLiters ?? 0;
  }

  public getTodayUsage(): number {
    const todayKey = formatDateKey(new Date());
    return this.store.dailyRecords[todayKey]?.consumedLiters ?? 0;
  }

  public getYesterdayUsage(): number {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = formatDateKey(yesterday);
    return this.store.dailyRecords[yKey]?.consumedLiters ?? 0;
  }

  public getLast7Days(): Array<{ date: string; dateKey: string; dayName: string; consumedLiters: number; refillsLiters: number }> {
    const res: Array<{ date: string; dateKey: string; dayName: string; consumedLiters: number; refillsLiters: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = formatDateKey(d);
      const rec = this.store.dailyRecords[key];
      const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
      res.push({
        date: key,
        dateKey: key,
        dayName,
        consumedLiters: rec?.consumedLiters ?? 0,
        refillsLiters: rec?.refillsLiters ?? 0,
      });
    }
    return res;
  }

  public getAverageDaily(): number {
    const last7 = this.getLast7Days();
    const sum = last7.reduce((acc, d) => acc + d.consumedLiters, 0);
    return Math.round((sum / 7) * 10) / 10;
  }

  public getDailyTarget(): number {
    try {
      const raw = localStorage.getItem('hydrosense_daily_target');
      if (raw) {
        const val = parseFloat(raw);
        if (!isNaN(val) && val > 0) return val;
      }
    } catch {}
    return 150;
  }

  public setDailyTarget(target: number): void {
    try {
      localStorage.setItem('hydrosense_daily_target', target.toString());
    } catch {}
  }

  public getMonthTotal(yearOrOffset: number = 0, month?: number): number {
    let targetYear: number;
    let targetMonth: number;
    if (month !== undefined) {
      targetYear = yearOrOffset;
      targetMonth = month;
    } else {
      const now = new Date();
      targetMonth = now.getMonth() - yearOrOffset;
      targetYear = now.getFullYear();
    }
    let total = 0;
    for (const [key, rec] of Object.entries(this.store.dailyRecords)) {
      const [y, m] = key.split('-').map(Number);
      if (y === targetYear && m === targetMonth + 1) {
        total += rec.consumedLiters;
      }
    }
    return Math.round(total * 10) / 10;
  }

  public getCustomRange(start: string, end: string): {
    totalConsumed: number;
    totalRefilled: number;
    records: Array<{ date: string; consumedLiters: number; refillsLiters: number }>;
  } {
    const records: Array<{ date: string; consumedLiters: number; refillsLiters: number }> = [];
    let totalConsumed = 0;
    let totalRefilled = 0;
    const keys = Object.keys(this.store.dailyRecords).sort();
    for (const key of keys) {
      if (key >= start && key <= end) {
        const rec = this.store.dailyRecords[key];
        const consumed = rec?.consumedLiters ?? 0;
        const refilled = rec?.refillsLiters ?? 0;
        records.push({
          date: key,
          consumedLiters: consumed,
          refillsLiters: refilled,
        });
        totalConsumed += consumed;
        totalRefilled += refilled;
      }
    }
    return {
      totalConsumed: Math.round(totalConsumed * 10) / 10,
      totalRefilled: Math.round(totalRefilled * 10) / 10,
      records,
    };
  }

  public clearHistory(): void {
    this.store = {
      samples: [],
      dailyRecords: {},
      lastLevel: null,
      lastTimestamp: null,
    };
    this.saveToStorage();
  }
}

export const usageTracker = new WaterUsageTracker();
