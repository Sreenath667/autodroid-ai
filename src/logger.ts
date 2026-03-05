const COLORS = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
} as const;

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_CONFIG: Record<LogLevel, { color: string; label: string; priority: number }> = {
    debug: { color: COLORS.dim, label: "DBG", priority: 0 },
    info: { color: COLORS.cyan, label: "INF", priority: 1 },
    warn: { color: COLORS.yellow, label: "WRN", priority: 2 },
    error: { color: COLORS.red, label: "ERR", priority: 3 },
};

class Logger {
    private enabled: boolean;
    private minLevel: LogLevel;

    constructor() {
        this.enabled = true;
        this.minLevel = "info";
    }

    /** Enable or disable logging */
    setEnabled(enabled: boolean) {
        this.enabled = enabled;
    }

    /** Set minimum log level */
    setLevel(level: LogLevel) {
        this.minLevel = level;
    }


    private log(level: LogLevel, message: string, ...args: any[]) {
        if (!this.enabled) return;
        if (LEVEL_CONFIG[level].priority < LEVEL_CONFIG[this.minLevel].priority) return;

        const config = LEVEL_CONFIG[level];
        const timestamp = new Date().toISOString().slice(11, 23);
        const prefix = `${COLORS.dim}${timestamp}${COLORS.reset} ${config.color}${config.label}${COLORS.reset}`;

        // Truncate long messages
        const truncated = message.length > 500 ? message.slice(0, 500) + "..." : message;
        console.log(`${prefix} ${truncated}`, ...args);
    }

    debug(message: string, ...args: any[]) {
        this.log("debug", message, ...args);
    }

    info(message: string, ...args: any[]) {
        this.log("info", message, ...args);
    }

    warn(message: string, ...args: any[]) {
        this.log("warn", message, ...args);
    }

    error(message: string, ...args: any[]) {
        this.log("error", message, ...args);
    }

    /** Log an ADB command */
    adb(command: string) {
        this.debug(`ADB ▸ ${command}`);
    }

    /** Log a tool call from the AI */
    tool(name: string, params?: Record<string, any>) {
        const paramStr = params ? ` ${JSON.stringify(params)}` : "";
        this.info(`🔧 Tool: ${name}${paramStr}`);
    }

    /** Log a step completion */
    step(stepNumber: number, action: string) {
        this.info(`📍 Step ${stepNumber}: ${action}`);
    }
}

// Singleton logger
export const logger = new Logger();

// Enable via environment variable
if (process.env.AUTODROID_DEBUG === "true" || process.env.AUTODROID_DEBUG === "1") {
    logger.setEnabled(true);
    logger.setLevel("debug");
}
