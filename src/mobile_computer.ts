import { FunctionDeclaration, Type } from "@google/genai";
import { ADBClient } from "./adb_client";
import { wait } from "./utils";
import { logger } from "./logger";

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

  const declaration: FunctionDeclaration = {
    name: "computer",
    description: `Mobile tool to perform actions on a mobile device. Screen size: ${screenWidth}×${screenHeight}.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: `Available actions:
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
screenshot: Take a screenshot (use when UI dump is not helpful or you need to see visuals).`,
        },
        coordinate: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Coordinates [x, y] for tap or long_press actions.",
        },
        start_coordinate: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Start coordinates [x, y] for swipe action.",
        },
        end_coordinate: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "End coordinates [x, y] for swipe action.",
        },
        text: {
          type: Type.STRING,
          description: "Text to type, or key name to press.",
        },
        duration: {
          type: Type.INTEGER,
          description: "Duration in ms for long_press, swipe, or wait.",
        },
        direction: {
          type: Type.STRING,
          description: "Direction for scroll action (up, down, left, right).",
        },
      },
      required: ["action"],
    },
  };

  const execute = async (args: any) => {
    const { action, coordinate, text, duration, start_coordinate, end_coordinate, direction } = args;
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
  };

  return { declaration, execute };
};
