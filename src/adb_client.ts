import { exec } from "child_process";
import { promisify } from "util";
import { parseUiDump } from "./ui_dump_parser";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import sharp from "sharp";
import { logger } from "./logger";
import type { Coordinate, ScreenSize, ADBClientOptions, ScrollDirection, DeviceInfo } from "./types";

const execAsync = promisify(exec);

const ANDROID_KEY_EVENTS: Record<string, string> = Object.entries({
  Enter: "KEYCODE_ENTER",
  Backspace: "KEYCODE_DEL",
  Tab: "KEYCODE_TAB",
  ArrowUp: "KEYCODE_DPAD_UP",
  ArrowDown: "KEYCODE_DPAD_DOWN",
  ArrowLeft: "KEYCODE_DPAD_LEFT",
  ArrowRight: "KEYCODE_DPAD_RIGHT",
  Escape: "KEYCODE_ESCAPE",
  Home: "KEYCODE_HOME",
  Back: "KEYCODE_BACK",
  Menu: "KEYCODE_MENU",
  Search: "KEYCODE_SEARCH",
  Delete: "KEYCODE_FORWARD_DEL",
  VolumeUp: "KEYCODE_VOLUME_UP",
  VolumeDown: "KEYCODE_VOLUME_DOWN",
  Power: "KEYCODE_POWER",
}).reduce((keyMap, [key, value]) => {
  keyMap[key.toLowerCase().trim()] = value;
  return keyMap;
}, {} as Record<string, string>);

// ── ADB Path Discovery ─────────────────────────────────────────────

export function getPotentialADBPaths(): string[] {
  const home = homedir();
  const platform = process.platform;
  const paths: string[] = [];

  if (platform === "win32") {
    paths.push(
      join(
        process.env.LOCALAPPDATA ?? "",
        "Android/Sdk/platform-tools/adb.exe"
      ),
      "C:\\Android\\sdk\\platform-tools\\adb.exe",
      join(home, "AppData/Local/Android/Sdk/platform-tools/adb.exe"),
      join(home, "AppData/Local/Android/android-sdk/platform-tools/adb.exe"),
      "C:\\Program Files\\Android\\android-sdk\\platform-tools\\adb.exe",
      "C:\\Program Files (x86)\\Android\\android-sdk\\platform-tools\\adb.exe"
    );
  } else if (platform === "darwin") {
    paths.push(
      "/usr/local/bin/adb",
      "/opt/homebrew/bin/adb",
      join(home, "Library/Android/sdk/platform-tools/adb"),
      "/Applications/Android Studio.app/Contents/sdk/platform-tools/adb"
    );
  } else if (platform === "linux") {
    paths.push(
      "/usr/local/bin/adb",
      "/usr/bin/adb",
      join(home, "Android/Sdk/platform-tools/adb"),
      "/opt/android-sdk/platform-tools/adb",
      "/opt/android-studio/sdk/platform-tools/adb"
    );
  } else {
    paths.push(
      "/usr/local/bin/adb",
      "/usr/bin/adb",
      join(home, "android-sdk/platform-tools/adb")
    );
  }

  if (process.env.ANDROID_HOME) {
    const adbExecutable = platform === "win32" ? "adb.exe" : "adb";
    paths.push(join(process.env.ANDROID_HOME, "platform-tools", adbExecutable));
  }

  return paths;
}

// ── Retry Helper ────────────────────────────────────────────────────

async function retry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 500,
  label: string = "command"
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < retries) {
        logger.warn(`${label} failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2; // exponential backoff
      }
    }
  }
  throw lastError;
}

// ── ADB Client ──────────────────────────────────────────────────────

export class ADBClient {
  private adbPath: string;
  private deviceSerial?: string;
  private originalAnimationScales: { window: string; transition: string; animator: string } | null = null;
  private _screenSize: ScreenSize | null = null;

  constructor(options?: ADBClientOptions) {
    this.adbPath = options?.adbPath ?? this.getAdbPath();
    this.deviceSerial = options?.deviceSerial;
  }

  getAdbPath(): string {
    const paths = getPotentialADBPaths();
    const validPath = paths.find((path) => existsSync(path));

    if (!validPath) {
      throw new Error(
        "ADB not found. Please ensure Android SDK is installed and properly configured.\n" +
        "Install from: https://developer.android.com/studio/releases/platform-tools"
      );
    }
    logger.debug(`ADB found at: ${validPath}`);
    return validPath;
  }

  /** Get the ADB command prefix, optionally targeting a specific device */
  private get adbCmd(): string {
    const serial = this.deviceSerial ? ` -s ${this.deviceSerial}` : "";
    return `"${this.adbPath}"${serial}`;
  }

  // ── Initialization & Cleanup ────────────────────────────────────

  /** Check if a device is connected and accessible */
  async isDeviceConnected(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`${this.adbCmd} devices`);
      const lines = stdout.trim().split("\n").slice(1); // skip header
      const devices = lines.filter((l) => l.includes("device") && !l.includes("offline"));
      return devices.length > 0;
    } catch {
      return false;
    }
  }

  /** List connected devices */
  async listDevices(): Promise<DeviceInfo[]> {
    const { stdout } = await execAsync(`${this.adbCmd} devices -l`);
    const lines = stdout.trim().split("\n").slice(1);
    return lines
      .filter((l) => l.trim())
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const modelMatch = line.match(/model:(\S+)/);
        return {
          serial: parts[0],
          state: parts[1],
          model: modelMatch?.[1],
        };
      });
  }

  /** Initialize — disables animations and caches screen size */
  async init(): Promise<void> {
    const connected = await this.isDeviceConnected();
    if (!connected) {
      throw new Error(
        "No Android device found. Please ensure:\n" +
        "  1. Your device is connected via USB, or an emulator is running\n" +
        "  2. USB debugging is enabled on the device\n" +
        "  3. You have authorized the computer on the device"
      );
    }

    // Save original animation scales for cleanup
    try {
      const [window, transition, animator] = await Promise.all([
        this.shell("settings get global window_animation_scale"),
        this.shell("settings get global transition_animation_scale"),
        this.shell("settings get global animator_duration_scale"),
      ]);
      this.originalAnimationScales = {
        window: window.stdout.trim() || "1.0",
        transition: transition.stdout.trim() || "1.0",
        animator: animator.stdout.trim() || "1.0",
      };
    } catch {
      this.originalAnimationScales = { window: "1.0", transition: "1.0", animator: "1.0" };
    }

    // Disable animations for reliable automation
    await Promise.all([
      this.shell("settings put global window_animation_scale 0"),
      this.shell("settings put global transition_animation_scale 0"),
      this.shell("settings put global animator_duration_scale 0"),
    ]);

    // Cache screen size
    this._screenSize = await this.screenSize();
    logger.info(`Device initialized — screen: ${this._screenSize.width}×${this._screenSize.height}`);
  }

  /** Restore device settings (animations) */
  async cleanup(): Promise<void> {
    if (this.originalAnimationScales) {
      try {
        await Promise.all([
          this.shell(`settings put global window_animation_scale ${this.originalAnimationScales.window}`),
          this.shell(`settings put global transition_animation_scale ${this.originalAnimationScales.transition}`),
          this.shell(`settings put global animator_duration_scale ${this.originalAnimationScales.animator}`),
        ]);
        logger.info("Device animations restored");
      } catch (error: any) {
        logger.warn(`Failed to restore animations: ${error.message}`);
      }
    }
  }

  /** Get cached screen size, or fetch it */
  get cachedScreenSize(): ScreenSize | null {
    return this._screenSize;
  }

  // ── Low-Level Commands ──────────────────────────────────────────

  async execOut(command: string) {
    logger.adb(`exec-out ${command}`);
    return execAsync(`${this.adbCmd} exec-out ${command}`);
  }

  async shell(command: string) {
    logger.adb(`shell ${command}`);
    return execAsync(`${this.adbCmd} shell ${command}`);
  }

  // ── Screen ──────────────────────────────────────────────────────

  async screenshot(quality: number = 25): Promise<Buffer> {
    return retry(async () => {
      const { stdout } = await execAsync(
        `${this.adbCmd} exec-out screencap -p`,
        {
          encoding: "buffer",
          maxBuffer: 25 * 1024 * 1024,
        }
      );
      return sharp(stdout)
        .png({ quality })
        .toBuffer();
    }, 3, 500, "screenshot");
  }

  async screenSize(): Promise<ScreenSize> {
    const { stdout } = await this.execOut("wm size");
    const match = stdout.match(/Physical size: (\d+)x(\d+)/);
    if (!match) {
      throw new Error("Failed to get viewport size. Check device connection.");
    }
    return {
      width: parseInt(match[1]),
      height: parseInt(match[2]),
    };
  }

  // ── Input Actions ───────────────────────────────────────────────

  async tap(coordinate: Coordinate): Promise<void> {
    const { x, y } = coordinate;
    logger.debug(`Tap: (${x}, ${y})`);
    await this.shell(`input tap ${x} ${y}`);
  }

  async doubleTap(coordinate: Coordinate): Promise<void> {
    const { x, y } = coordinate;
    logger.debug(`Double-tap: (${x}, ${y})`);
    await this.shell(`input tap ${x} ${y}`);
    await this.shell(`input tap ${x} ${y}`);
  }

  async longPress(coordinate: Coordinate, duration: number = 1000): Promise<void> {
    const { x, y } = coordinate;
    logger.debug(`Long-press: (${x}, ${y}) for ${duration}ms`);
    // A long press is a swipe that starts and ends at the same point
    await this.shell(`input swipe ${x} ${y} ${x} ${y} ${duration}`);
  }

  async swipe(start: Coordinate, end: Coordinate, duration: number = 300): Promise<void> {
    const { x: startX, y: startY } = start;
    const { x: endX, y: endY } = end;
    logger.debug(`Swipe: (${startX},${startY}) → (${endX},${endY}) in ${duration}ms`);
    await this.shell(`input swipe ${startX} ${startY} ${endX} ${endY} ${duration}`);
  }

  async scroll(direction: ScrollDirection, amount: number = 500): Promise<void> {
    if (!this._screenSize) {
      this._screenSize = await this.screenSize();
    }
    const { width, height } = this._screenSize;
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);

    const scrollMap: Record<ScrollDirection, { start: Coordinate; end: Coordinate }> = {
      up: { start: { x: centerX, y: centerY + amount }, end: { x: centerX, y: centerY - amount } },
      down: { start: { x: centerX, y: centerY - amount }, end: { x: centerX, y: centerY + amount } },
      left: { start: { x: centerX + amount, y: centerY }, end: { x: centerX - amount, y: centerY } },
      right: { start: { x: centerX - amount, y: centerY }, end: { x: centerX + amount, y: centerY } },
    };

    const { start, end } = scrollMap[direction];
    logger.debug(`Scroll: ${direction} by ${amount}px`);
    await this.swipe(start, end, 300);
  }

  async type(text: string): Promise<void> {
    // Escape special shell characters for ADB
    const escaped = text.replace(/([\"\\`$&|;()<>!#~{}[\]*?])/g, "\\$1").replace(/\s/g, "\\ ");
    logger.debug(`Type: "${text}"`);
    await this.shell(`input text "${escaped}"`);
  }

  async keyPress(key: string): Promise<void> {
    const androidKey = ANDROID_KEY_EVENTS[key.toLowerCase()];
    if (!androidKey) {
      throw new Error(
        `Unsupported key: "${key}". Supported keys: ${Object.keys(ANDROID_KEY_EVENTS).join(", ")}`
      );
    }
    logger.debug(`Key press: ${key} → ${androidKey}`);
    await this.shell(`input keyevent ${androidKey}`);
  }

  // ── Navigation Shortcuts ────────────────────────────────────────

  async goBack(): Promise<void> {
    logger.debug("Navigation: Back");
    await this.shell("input keyevent KEYCODE_BACK");
  }

  async goHome(): Promise<void> {
    logger.debug("Navigation: Home");
    await this.shell("input keyevent KEYCODE_HOME");
  }

  async openRecents(): Promise<void> {
    logger.debug("Navigation: Recents");
    await this.shell("input keyevent KEYCODE_APP_SWITCH");
  }

  // ── App Management ──────────────────────────────────────────────

  async listPackages(filter?: string): Promise<string[]> {
    const { stdout } = await this.execOut(`pm list packages ${filter || ""}`);
    return stdout
      .split("\n")
      .map((line) => line.replace("package:", "").trim())
      .filter(Boolean);
  }

  async openApp(packageName: string): Promise<void> {
    logger.info(`Opening app: ${packageName}`);
    const result = await this.shell(`monkey -p ${packageName} 1`);
    if (result.stderr && result.stderr.includes("No activities found")) {
      throw new Error(`Failed to open app "${packageName}": no activities found. Is it installed?`);
    }
  }

  /** Get the currently focused activity */
  async getCurrentActivity(): Promise<string> {
    const { stdout } = await this.shell("dumpsys window | grep mCurrentFocus");
    const match = stdout.match(/mCurrentFocus=\S+ (\S+)/);
    return match ? match[1].replace("}", "") : "unknown";
  }

  // ── UI Hierarchy ────────────────────────────────────────────────

  async dumpUI(): Promise<string> {
    return retry(async () => {
      const { stdout } = await this.execOut(
        `uiautomator dump --compressed /dev/tty`
      );
      const ui = JSON.stringify(parseUiDump(stdout));
      return ui;
    }, 3, 500, "UI dump");
  }

  // ── Clipboard ───────────────────────────────────────────────────

  async setClipboard(text: string): Promise<void> {
    logger.debug(`Setting clipboard: "${text}"`);
    await this.shell(`am broadcast -a clipper.set -e text "${text}"`);
  }
}
