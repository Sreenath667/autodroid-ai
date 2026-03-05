import { GoogleGenAI, FunctionDeclaration, Type, Content, Part } from "@google/genai";
import { ADBClient } from "./adb_client";
import { createMobileComputer } from "./mobile_computer";
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
  llm = "gemini-3-flash-preview",
  maxSteps = 100,
  maxRetries = 3,
  verbose = false,
  screenshotQuality,
  onStep,
  signal,
}: MobileUseOptions): Promise<MobileUseResult> {
  // Detailed debug logging if verbose
  if (verbose) {
    logger.setLevel("debug");
  }

  const startTime = Date.now();
  const steps: StepInfo[] = [];
  let stepNumber = 0;

  logger.info(`Starting task: "${task}"`);

  const adbClient = new ADBClient();
  await adbClient.init();

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    });
    const computerTool = await createMobileComputer(adbClient);

    const openAppDecl: FunctionDeclaration = {
      name: "openApp",
      description: "Open an app on the Android device by its package name. Use listApps first if you're unsure of the exact package name.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "Package name of the app to open (e.g., com.google.android.dialer, com.instagram.android)",
          },
        },
        required: ["name"],
      },
    };

    const listAppsDecl: FunctionDeclaration = {
      name: "listApps",
      description: "Search for installed apps by partial package name. Returns matching package names.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "Partial package name to filter (e.g., 'instagram', 'whatsapp').",
          },
        },
        required: ["name"],
      },
    };

    const tools = [{ functionDeclarations: [openAppDecl, listAppsDecl, computerTool.declaration] }];

    let currentHistory: Content[] = [
      { role: "user", parts: [{ text: MobileUsePrompt }, { text: task }] }
    ];

    let finalResponseText = "";

    // Initial call to set up the conversation with tools
    await ai.models.generateContent({
      model: llm,
      contents: currentHistory,
      config: {
        tools: tools,
      }
    });

    for (let step = 0; step < maxSteps; step++) {
      if (signal?.aborted) throw new Error("Aborted");

      const response = await ai.models.generateContent({
        model: llm,
        contents: currentHistory,
        config: {
          tools: tools,
        }
      });

      const functionCalls = response.functionCalls;

      // Extract text manually to avoid the SDK's warning about reading .text when function calls are present
      let text = "";
      const parts = response.candidates?.[0]?.content?.parts || [];
      const textParts = parts.filter(p => p.text);
      if (textParts.length > 0) {
        text = textParts.map(p => p.text).join("");
      }

      // Add model response to history
      currentHistory.push({ role: "model", parts });

      if (text) {
        logger.info(`Model: ${text}`);
        finalResponseText = text;
      }

      if (!functionCalls || functionCalls.length === 0) {
        // No more function calls, we are done
        break;
      }

      // Execute tool calls
      const toolResultsParts: Part[] = [];
      for (const call of functionCalls) {
        const name = call.name;
        const args = call.args as any;
        stepNumber++;
        const stepInfo: StepInfo = {
          stepNumber,
          action: `${name}(${JSON.stringify(args)})`,
          timestamp: Date.now(),
        };

        let result;
        try {
          if (name === "openApp") {
            await adbClient.openApp(args.name);
            result = `Successfully opened ${args.name}`;
            logger.step(stepNumber, `Opened app: ${args.name}`);
          } else if (name === "listApps") {
            const list = await adbClient.listPackages(args.name);
            result = list.length > 0 ? list.join("\n") : `No packages found matching "${args.name}".`;
            logger.step(stepNumber, `Listed apps matching "${args.name}": ${list.length} results`);
          } else if (name === "computer") {
            const exeResult = await computerTool.execute(args);
            result = typeof exeResult === 'object' && exeResult !== null && 'data' in exeResult ? 'Image returned' : exeResult;
          } else {
            result = `Unknown tool: ${name}`;
          }
          stepInfo.result = typeof result === "string" ? result : "success";
        } catch (error: any) {
          result = `error: ${error.message}`;
          stepInfo.result = result;
          logger.error(`Tool ${name} failed: ${error.message}`);
        }

        steps.push(stepInfo);
        onStep?.(stepInfo);

        toolResultsParts.push({
          functionResponse: {
            name: name,
            response: { result },
          }
        });
      }

      // Add tool responses to history
      currentHistory.push({ role: "user", parts: toolResultsParts });
    }

    const totalDuration = Date.now() - startTime;
    logger.info(`Task completed in ${(totalDuration / 1000).toFixed(1)}s with ${steps.length} steps`);

    return {
      text: finalResponseText || "Task complete.",
      steps,
      totalDuration,
    };
  } finally {
    // Always restore device settings
    await adbClient.cleanup();
  }
}
