import { tool } from "ai";
import { ADBClient } from "./adb_client";
import { z } from "zod";
import { wait } from "./utils";
import { logger } from "./logger";

const Coordinate = z.array(z.number()).length(2);

export const createMobileComputer = async (adbClient: ADBClient) => {
  const viewportSize = await adbClient.screenSize();
  const { width: screenWidth, height: screenHeight } = viewportSize;

  /** Validate a coordinate is within screen bounds */
  function validateCoordinate(coord: number[], label: string = "coordinate"): void {
    const [x, y] = coord;
    if (x < 0 || x > screenWidth || y < 0 || y > screenHeight) {
      throw new Error(
        `${label} (${x},${y}) is out of screen bounds (${screenWidth}×${screenHeight}). ` +
        `Valid range: x=[0,${screenWidth}], y=[0,${screenHeight}]`
      );
    }
  }

  const mobileComputer = tool({
    description: `Mobile tool to perform actions on a mobile device. Screen size: ${screenWidth}×${screenHeight}.`,

    experimental_toToolResultContent(result: any) {
      return typeof result === "string"
        ? [{ type: "text", text: result }]
        : [{ type: "image", data: result?.data, mimeType: "image/png" }];
    },
    args: {
      displayHeightPx: screenHeight,
      displayWidthPx: screenWidth,
      displayNumber: 0,
    },
    parameters: z.object({
      action: z.enum([
        "ui_dump",
        "tap",
        "long_press",
        "swipe",
        "scroll",
        "type",
        "press",
        "back",
        "home",
        "get_current_app",
        "wait",
        "screenshot",
      ])
        .describe(`Available actions:
ui_dump: Get UI elements for the current screen (structured JSON tree).
tap: Tap on the provided coordinate.
long_press: Long press on a coordinate for a duration.
swipe: Swipe from start_coordinate to end_coordinate.
scroll: Scroll in a direction (up/down/left/right).
type: Type text into the currently focused input field.
press: Press a mobile key (Enter, Backspace, Tab, etc).
back: Press the back button.
home: Press the home button.
get_current_app: Get the currently active app/activity.
wait: Wait for a specified duration (ms).
screenshot: Take a screenshot (use when UI dump is not helpful or you need to see visuals).
      `),
      coordinate: Coordinate.optional().describe("Coordinates [x, y] for tap or long_press actions."),
      start_coordinate: Coordinate.optional().describe("Start coordinates [x, y] for swipe action."),
      end_coordinate: Coordinate.optional().describe("End coordinates [x, y] for swipe action."),
      text: z.string().optional().describe("Text to type, or key name to press."),
      duration: z.number().optional().describe("Duration in ms for long_press, swipe, or wait."),
      direction: z.enum(["up", "down", "left", "right"]).optional().describe("Direction for scroll action."),
    }),
    async execute({
      action,
      coordinate,
      text,
      duration,
      start_coordinate,
      end_coordinate,
      direction,
    }) {
      logger.tool("computer", { action, coordinate, text, duration, direction });

      // ── UI Dump ───────────────────────────────────────────────
      if (action === "ui_dump") {
        return adbClient.dumpUI();
      }

      // ── Tap ───────────────────────────────────────────────────
      if (action === "tap") {
        if (!coordinate) return "Error: coordinate is required for tap action.";
        validateCoordinate(coordinate);
        const [x, y] = coordinate;
        await adbClient.tap({ x, y });
        await wait(300); // brief wait for UI to settle
        return adbClient.dumpUI();
      }

      // ── Long Press ────────────────────────────────────────────
      if (action === "long_press") {
        if (!coordinate) return "Error: coordinate is required for long_press action.";
        validateCoordinate(coordinate);
        const [x, y] = coordinate;
        await adbClient.longPress({ x, y }, duration || 1000);
        await wait(300);
        return adbClient.dumpUI();
      }

      // ── Press Key ─────────────────────────────────────────────
      if (action === "press") {
        if (!text) return "Error: text (key name) is required for press action.";
        await adbClient.keyPress(text);
        await wait(200);
        return adbClient.dumpUI();
      }

      // ── Back ──────────────────────────────────────────────────
      if (action === "back") {
        await adbClient.goBack();
        await wait(300);
        return adbClient.dumpUI();
      }

      // ── Home ──────────────────────────────────────────────────
      if (action === "home") {
        await adbClient.goHome();
        await wait(500);
        return adbClient.dumpUI();
      }

      // ── Type ──────────────────────────────────────────────────
      if (action === "type") {
        if (!text) return "Error: text is required for type action.";
        await adbClient.type(text);
        await wait(200);
        return adbClient.dumpUI();
      }

      // ── Screenshot ────────────────────────────────────────────
      if (action === "screenshot") {
        const screenshot = await adbClient.screenshot();
        return {
          data: screenshot.toString("base64"),
          type: "image/png",
        };
      }

      // ── Swipe ─────────────────────────────────────────────────
      if (action === "swipe") {
        if (!start_coordinate) return "Error: start_coordinate is required for swipe action.";
        if (!end_coordinate) return "Error: end_coordinate is required for swipe action.";
        validateCoordinate(start_coordinate, "start_coordinate");
        validateCoordinate(end_coordinate, "end_coordinate");
        const [sx, sy] = start_coordinate;
        const [ex, ey] = end_coordinate;
        await adbClient.swipe({ x: sx, y: sy }, { x: ex, y: ey }, duration);
        await wait(300);
        return adbClient.dumpUI();
      }

      // ── Scroll ────────────────────────────────────────────────
      if (action === "scroll") {
        if (!direction) return "Error: direction is required for scroll action.";
        await adbClient.scroll(direction, duration || 500);
        await wait(300);
        return adbClient.dumpUI();
      }

      // ── Get Current App ───────────────────────────────────────
      if (action === "get_current_app") {
        const activity = await adbClient.getCurrentActivity();
        return `Current activity: ${activity}`;
      }

      // ── Wait ──────────────────────────────────────────────────
      if (action === "wait") {
        const ms = duration || 1000;
        await wait(ms);
        return `Waited for ${ms}ms.`;
      }

      return "Unknown action.";
    },
  });

  return mobileComputer;
};
