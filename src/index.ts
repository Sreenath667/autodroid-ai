import { generateText, LanguageModel, tool } from "ai";
import { z } from "zod";
import { ADBClient } from "./adb_client";
import { createMobileComputer } from "./mobile_computer";
import { openai } from "@ai-sdk/openai";
import { logger } from "./logger";
import type { MobileUseOptions, MobileUseResult, StepInfo } from "./types";
export { autoDroid as mobileUse }; // backward compat alias

// Re-exports for consumers
export { ADBClient } from "./adb_client";
export { parseBounds, getElementCenter, describeUi } from "./ui_dump_parser";
export type {
  MobileUseOptions,
  MobileUseResult,
  StepInfo,
  Coordinate,
  Bounds,
  ScreenSize,
  UiElement,
  ADBClientOptions,
  DeviceInfo,
} from "./types";

// ── System Prompt ───────────────────────────────────────────────────

const MobileUsePrompt = `You are an expert mobile automation engineer controlling an Android device.
Your job is to navigate the device and perform actions to fulfill the user's request.

<strategy>
1. ALWAYS start by taking a ui_dump or screenshot to understand the current screen state.
2. If the user asks to use a specific app, open it first using openApp before any other action.
3. After each action, verify the expected result occurred before proceeding to the next step.
4. If an action fails or the screen doesn't change as expected, try an alternative approach.
</strategy>

<guidelines>
- Use ui_dump for navigation and finding elements — it's faster and cheaper than screenshots.
- Use screenshot only when visual context is needed (e.g., images, colors, layout verification).
- Do NOT take ui_dump more than once per action step. Use it sparingly.
- When typing text, first tap the input field to focus it, then use the type action.
- Use the back action to navigate backwards, home to return to the launcher.
- For scrolling through lists or pages, use the scroll action with a direction.
- Use long_press for context menus or drag-and-drop starts.
- Use get_current_app to verify you're in the correct app.
- Coordinates in UI dump bounds are in format [x1,y1][x2,y2]. Tap the center of elements.
</guidelines>

<completion>
- When the task is complete, respond with a clear summary of what was accomplished.
- If the task cannot be completed (e.g., app not installed, permission denied), explain why.
- Do NOT loop indefinitely — if you've tried 3 different approaches and none work, report failure.
</completion>
`;

// ── Main Function ───────────────────────────────────────────────────

export async function autoDroid({
  task,
  llm = openai("gpt-4o"),
  maxSteps = 100,
  maxRetries = 3,
  verbose = false,
  screenshotQuality,
  onStep,
  signal,
}: MobileUseOptions): Promise<MobileUseResult> {
  // Enable logging if verbose
  if (verbose) {
    logger.setEnabled(true);
  }

  const startTime = Date.now();
  const steps: StepInfo[] = [];
  let stepNumber = 0;

  logger.info(`Starting task: "${task}"`);

  const adbClient = new ADBClient();
  await adbClient.init();

  try {
    const computer = await createMobileComputer(adbClient);

    const response = await generateText({
      messages: [
        {
          role: "system",
          content: MobileUsePrompt,
        },
        {
          role: "user",
          content: task,
        },
      ],
      model: llm,
      maxRetries,
      maxSteps,
      abortSignal: signal,
      tools: {
        openApp: tool({
          parameters: z.object({
            name: z
              .string()
              .describe(
                "Package name of the app to open (e.g., com.google.android.dialer, com.instagram.android)"
              ),
          }),
          description:
            "Open an app on the Android device by its package name. Use listApps first if you're unsure of the exact package name.",
          async execute({ name }) {
            stepNumber++;
            const step: StepInfo = {
              stepNumber,
              action: `openApp(${name})`,
              timestamp: Date.now(),
            };

            try {
              await adbClient.openApp(name);
              step.result = "success";
              logger.step(stepNumber, `Opened app: ${name}`);
            } catch (error: any) {
              step.result = `error: ${error.message}`;
              logger.error(`Failed to open app: ${name} — ${error.message}`);
            }
            steps.push(step);
            onStep?.(step);

            return step.result === "success"
              ? `Successfully opened ${name}`
              : `Failed to open ${name}: ${step.result}`;
          },
        }),

        listApps: tool({
          parameters: z.object({
            name: z.string().describe("Partial package name to filter (e.g., 'instagram', 'whatsapp')."),
          }),
          description:
            "Search for installed apps by partial package name. Returns matching package names.",
          async execute({ name }) {
            stepNumber++;
            const step: StepInfo = {
              stepNumber,
              action: `listApps(${name})`,
              timestamp: Date.now(),
            };

            const list = await adbClient.listPackages(name);
            step.result = `found ${list.length} packages`;
            steps.push(step);
            onStep?.(step);

            logger.step(stepNumber, `Listed apps matching "${name}": ${list.length} results`);
            return list.length > 0
              ? list.join("\n")
              : `No packages found matching "${name}".`;
          },
        }),

        computer,
      },
    });

    const totalDuration = Date.now() - startTime;
    logger.info(`Task completed in ${(totalDuration / 1000).toFixed(1)}s with ${steps.length} steps`);

    return {
      text: response.text,
      steps,
      totalDuration,
    };
  } finally {
    // Always restore device settings
    await adbClient.cleanup();
  }
}
