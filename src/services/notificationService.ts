/**
 * HydroSense Notification Service
 *
 * Provides useful, intelligent push & native notifications without spamming:
 * 1. Tank Overflow Risk / Cutoff Exceeded (Immediate alert with cooldown & state hysteresis)
 * 2. Target Level Reached (Fires strictly once per filling cycle)
 * 3. Low Water Reserve Warning (Fires strictly once when entering low zone)
 * 4. Ultrasonic Sensor Offline / Hardware Alert (Debounced with 15 min cooldown)
 * 5. Device Link Confirmation (Fires once upon connection)
 *
 * Dual delivery:
 * - Native Android Status Bar Notification (via window.AndroidBridge.postNotification)
 * - Web / PWA Notification API (fallback)
 * - In-app visual notification toast
 */

import { TelemetryData } from '../types';

export interface NotificationSettings {
  enabled: boolean;
  notifyOnTarget: boolean;
  notifyOnLow: boolean;
  notifyOnCutoff: boolean;
  notifyOnSensorError: boolean;
}

const SETTINGS_KEY = 'hydrosense_notification_settings';

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  notifyOnTarget: true,
  notifyOnLow: true,
  notifyOnCutoff: true,
  notifyOnSensorError: true,
};

export interface InAppToast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: number;
}

type ToastCallback = (toast: InAppToast) => void;

class NotificationService {
  private settings: NotificationSettings = DEFAULT_SETTINGS;
  private toastListeners: Set<ToastCallback> = new Set();

  // State hysteresis tracking to prevent notification spam
  private hasNotifiedTargetThisCycle = false;
  private hasNotifiedLowThisCycle = false;
  private lastCutoffNotificationTime = 0;
  private lastSensorErrorNotificationTime = 0;
  private lastConnectedStatus = false;

  constructor() {
    this.loadSettings();
  }

  public loadSettings(): NotificationSettings {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    return this.settings;
  }

  public saveSettings(newSettings: Partial<NotificationSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {}
  }

  public getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  public subscribeToToasts(callback: ToastCallback): () => void {
    this.toastListeners.add(callback);
    return () => {
      this.toastListeners.delete(callback);
    };
  }

  /**
   * Request system notification permission (Native Android or Web)
   */
  public async requestPermission(): Promise<boolean> {
    // 1. If running inside native Android APK container
    if (typeof window !== 'undefined' && window.AndroidBridge?.requestNotificationPermission) {
      window.AndroidBridge.requestNotificationPermission();
      return window.AndroidBridge.hasNotificationPermission?.() ?? true;
    }

    // 2. Standard Web Notification API
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const result = await Notification.requestPermission();
        return result === 'granted';
      } catch {
        return false;
      }
    }

    return false;
  }

  public hasPermission(): boolean {
    if (typeof window !== 'undefined' && window.AndroidBridge?.hasNotificationPermission) {
      return window.AndroidBridge.hasNotificationPermission();
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission === 'granted';
    }
    return false;
  }

  /**
   * Dispatch a notification to the system and in-app toasts
   */
  public dispatchNotification(
    type: 'info' | 'success' | 'warning' | 'critical',
    title: string,
    message: string,
    tag: string = 'hydrosense_alert'
  ): void {
    // Emit in-app toast for immediate on-screen visibility
    const toast: InAppToast = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      title,
      message,
      timestamp: Date.now(),
    };
    this.toastListeners.forEach((fn) => fn(toast));

    if (!this.settings.enabled) return;

    // 1. Deliver via Native Android Notification Bridge
    if (typeof window !== 'undefined' && window.AndroidBridge?.postNotification) {
      try {
        window.AndroidBridge.postNotification(title, message, tag);
        return;
      } catch (err) {
        console.warn('Native Android notification failed:', err);
      }
    }

    // 2. Deliver via Web Notification API
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: message,
          icon: './pwa-icon.png',
          badge: './pwa-icon.png',
          tag,
        });
      } catch (err) {
        console.warn('Web notification failed:', err);
      }
    }
  }

  /**
   * Evaluate live telemetry against intelligent anti-spam thresholds
   */
  public evaluateTelemetry(telemetry: TelemetryData, tankCapacityLiters: number = 500): void {
    if (!this.settings.enabled) return;

    const now = Date.now();
    const water = telemetry.water;
    const target = telemetry.target ?? 90;
    const cutoff = telemetry.cutoff ?? 95;

    // 1. Handle Sensor Fault / Offline Alert
    if (telemetry.isSensorUnavailable || telemetry.error !== 'NONE') {
      if (
        this.settings.notifyOnSensorError &&
        now - this.lastSensorErrorNotificationTime > 15 * 60 * 1000 // 15 min cooldown
      ) {
        this.lastSensorErrorNotificationTime = now;
        this.dispatchNotification(
          'critical',
          '⚠️ HydroSense: Ultrasonic Sensor Offline',
          'Ultrasonic distance sensor has lost echo signal. Please verify sensor wiring & Arduino power.',
          'sensor_offline'
        );
      }
      return;
    }

    // If valid water level is available
    if (water !== null && typeof water === 'number' && !isNaN(water)) {
      const liters = Math.round((water / 100) * tankCapacityLiters);

      // 2. Cutoff / Overflow Risk (Highest Priority)
      if (water >= cutoff) {
        // Cooldown: at least 10 minutes between repeat cutoff alerts
        if (
          this.settings.notifyOnCutoff &&
          now - this.lastCutoffNotificationTime > 10 * 60 * 1000
        ) {
          this.lastCutoffNotificationTime = now;
          this.dispatchNotification(
            'critical',
            '🚨 HydroSense: Tank Overflow Cutoff!',
            `Water level is at ${water.toFixed(1)}% (${liters}L), exceeding safety cutoff (${cutoff}%). Please stop the water motor immediately!`,
            'cutoff_warning'
          );
        }
      } else if (water <= cutoff - 4) {
        // Safe hysteresis reset: when level safely recedes below cutoff
        this.lastCutoffNotificationTime = 0;
      }

      // 3. Target Reached (Useful Milestone Notification - strictly once per fill cycle)
      if (water >= target && water < cutoff) {
        if (this.settings.notifyOnTarget && !this.hasNotifiedTargetThisCycle) {
          this.hasNotifiedTargetThisCycle = true;
          this.dispatchNotification(
            'success',
            '✅ HydroSense: Target Level Reached',
            `Tank water reached ${water.toFixed(1)}% (${liters}L). Target mark (${target}%) has been achieved. You can turn off the motor now.`,
            'target_reached'
          );
        }
      } else if (water <= target - 6) {
        // Reset target alert flag once water level drops at least 6% below target
        this.hasNotifiedTargetThisCycle = false;
      }

      // 4. Low Water Reserve Warning (Strictly once when entering low reserve zone)
      if (water <= 20 && water > 0) {
        if (this.settings.notifyOnLow && !this.hasNotifiedLowThisCycle) {
          this.hasNotifiedLowThisCycle = true;
          this.dispatchNotification(
            'warning',
            '⚠️ HydroSense: Low Water Reserve',
            `Water level is down to ${water.toFixed(1)}% (${liters}L remaining). Consider starting your pump or scheduling water supply.`,
            'low_water'
          );
        }
      } else if (water >= 32) {
        // Reset low water alert flag once tank has refilled to over 32%
        this.hasNotifiedLowThisCycle = false;
      }
    }
  }

  /**
   * Notify on hardware connection status changes
   */
  public handleConnectionState(isConnected: boolean, transportLabel: string): void {
    if (isConnected && !this.lastConnectedStatus) {
      this.lastConnectedStatus = true;
      this.dispatchNotification(
        'info',
        '📡 HydroSense Hardware Connected',
        `Linked to Arduino telemetry via ${transportLabel}. Real-time water monitoring is active.`,
        'hw_connected'
      );
    } else if (!isConnected) {
      this.lastConnectedStatus = false;
    }
  }

  /**
   * Trigger a test notification to let user confirm system alerts work
   */
  public sendTestNotification(): void {
    this.dispatchNotification(
      'info',
      '🔔 HydroSense Test Notification',
      'System alerts are working properly! You will receive useful notifications for target level, low reserve, and overflow risk.',
      'test_alert'
    );
  }
}

export const notificationService = new NotificationService();
