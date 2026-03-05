import { LanguageModel } from "ai";

// ── Coordinates & Geometry ──────────────────────────────────────────

export interface Coordinate {
    x: number;
    y: number;
}

export interface Bounds {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
}

export interface ScreenSize {
    width: number;
    height: number;
}

// ── UI Elements ─────────────────────────────────────────────────────

export interface UiElement {
    id?: string;
    type: string;
    text?: string;
    desc?: string;
    clickable: boolean;
    scrollable?: boolean;
    focused?: boolean;
    enabled?: boolean;
    checked?: boolean;
    bounds: string;
    parsedBounds?: Bounds;
    children?: UiElement[];
}

// ── Device ──────────────────────────────────────────────────────────

export interface DeviceInfo {
    serial: string;
    state: string;
    model?: string;
}

export interface ADBClientOptions {
    adbPath?: string;
    deviceSerial?: string;
}

// ── Mobile Use Options ──────────────────────────────────────────────

export interface StepInfo {
    stepNumber: number;
    action: string;
    timestamp: number;
    result?: string;
}

export interface MobileUseOptions {
    task: string;
    llm?: LanguageModel;
    maxSteps?: number;
    maxRetries?: number;
    verbose?: boolean;
    screenshotQuality?: number;
    onStep?: (step: StepInfo) => void;
    signal?: AbortSignal;
}

export interface MobileUseResult {
    text: string;
    steps: StepInfo[];
    totalDuration: number;
}

// ── Scroll ──────────────────────────────────────────────────────────

export type ScrollDirection = "up" | "down" | "left" | "right";
