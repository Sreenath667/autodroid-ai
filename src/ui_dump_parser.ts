import { XMLParser } from "fast-xml-parser";
import type { UiElement, Bounds } from "./types";

// ── Bounds Parsing ──────────────────────────────────────────────────

/**
 * Parses a bounds string like "[0,0][1080,2340]" into a structured object
 * with coordinates, dimensions, and center point.
 */
export function parseBounds(boundsStr: string): Bounds | null {
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return null;

  const x1 = parseInt(match[1]);
  const y1 = parseInt(match[2]);
  const x2 = parseInt(match[3]);
  const y2 = parseInt(match[4]);

  return {
    x1,
    y1,
    x2,
    y2,
    centerX: Math.floor((x1 + x2) / 2),
    centerY: Math.floor((y1 + y2) / 2),
    width: x2 - x1,
    height: y2 - y1,
  };
}

/**
 * Get the center coordinate of a bounds string — useful for tap targets.
 */
export function getElementCenter(boundsStr: string): { x: number; y: number } | null {
  const bounds = parseBounds(boundsStr);
  if (!bounds) return null;
  return { x: bounds.centerX, y: bounds.centerY };
}

// ── XML Parsing ─────────────────────────────────────────────────────

/**
 * Parses ADB UI dumps into a simplified tree for AI agent navigation.
 */
export function parseUiDump(xmlDump: string): UiElement {
  const options = {
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: true,
    isArray: (name: string) => name === "node",
  };

  const parser = new XMLParser(options);

  try {
    const parsed = parser.parse(xmlDump);

    if (parsed.hierarchy && parsed.hierarchy.node && parsed.hierarchy.node[0]) {
      return simplifyNode(parsed.hierarchy.node[0]);
    }
  } catch (error: any) {
    // Return empty root if XML parsing fails
  }

  return { type: "root", clickable: false, bounds: "[0,0][0,0]" };
}

// ── Node Simplification ─────────────────────────────────────────────

function hasContent(str: any): boolean {
  return typeof str === "string" && str !== "";
}

/**
 * Converts a complex node into a simplified structure with
 * richer properties for AI comprehension.
 */
function simplifyNode(node: any): UiElement {
  const element: UiElement = {
    type: getElementType(node),
    clickable: node.clickable === "true",
    bounds: node.bounds || "[0,0][0,0]",
  };

  // Parse bounds into structured object
  const parsed = parseBounds(element.bounds);
  if (parsed) {
    element.parsedBounds = parsed;
  }

  // Text content
  if (hasContent(node.text)) {
    element.text = node.text;
  }

  // Content description (accessibility label)
  if (hasContent(node["content-desc"])) {
    element.desc = node["content-desc"];
  }

  // Resource ID (simplified)
  if (hasContent(node["resource-id"])) {
    const idParts = node["resource-id"].split("/");
    element.id = idParts[idParts.length - 1];
  }

  // Interactive states
  if (node.scrollable === "true") {
    element.scrollable = true;
  }
  if (node.focused === "true") {
    element.focused = true;
  }
  if (node.enabled === "false") {
    element.enabled = false;
  }
  if (node.checked === "true") {
    element.checked = true;
  }

  // Process children
  if (node.node && node.node.length > 0) {
    if (shouldCollapseContainer(node)) {
      element.children = flattenChildren(node.node);
    } else {
      const meaningfulChildren = node.node
        .filter((child: any) => isMeaningfulNode(child))
        .map((child: any) => simplifyNode(child));

      if (meaningfulChildren.length > 0) {
        element.children = meaningfulChildren;
      }
    }
  }

  return element;
}

// ── Container Collapsing ────────────────────────────────────────────

function shouldCollapseContainer(node: any): boolean {
  return (
    !hasContent(node.text) &&
    !hasContent(node["content-desc"]) &&
    node.clickable !== "true" &&
    node.scrollable !== "true" &&
    !hasContent(node["resource-id"]) &&
    (node.class?.includes("Layout") || node.class?.includes("ViewGroup"))
  );
}

function flattenChildren(nodes: any[]): UiElement[] {
  let result: UiElement[] = [];

  for (const child of nodes) {
    if (shouldCollapseContainer(child) && child.node) {
      result = result.concat(flattenChildren(child.node));
    } else if (isMeaningfulNode(child)) {
      result.push(simplifyNode(child));
    }
  }

  return result;
}

// ── Meaningful Node Detection ───────────────────────────────────────

function isMeaningfulNode(node: any): boolean {
  if (node.clickable === "true" || node.scrollable === "true") return true;
  if (hasContent(node.text) || hasContent(node["content-desc"])) return true;
  if (hasContent(node["resource-id"])) return true;
  if (node.focused === "true") return true;
  if (node.node && node.node.length > 0) {
    return node.node.some((child: any) => isMeaningfulNode(child));
  }
  return false;
}

// ── Element Type Mapping ────────────────────────────────────────────

function getElementType(node: any): string {
  const className = node.class || "";

  if (className.includes("Button")) return "button";
  if (className.includes("EditText")) return "input";
  if (className.includes("TextView")) return "text";
  if (className.includes("ImageView")) return "image";
  if (className.includes("CheckBox")) return "checkbox";
  if (className.includes("RadioButton")) return "radio";
  if (className.includes("Switch") || className.includes("Toggle")) return "switch";
  if (className.includes("SeekBar")) return "slider";
  if (className.includes("ProgressBar")) return "progress";
  if (className.includes("Spinner")) return "dropdown";
  if (className.includes("WebView")) return "webview";
  if (className.includes("RecyclerView") || className.includes("ListView")) return "list";
  if (className.includes("ScrollView")) return "scrollview";
  if (className.includes("CardView")) return "card";
  if (className.includes("TabLayout") || className.includes("TabWidget")) return "tabs";
  if (className.includes("Toolbar") || className.includes("ActionBar")) return "toolbar";
  if (className.includes("NavigationView") || className.includes("BottomNavigation")) return "nav";

  // Dialpad buttons
  if (
    hasContent(node["resource-id"]) &&
    (node["resource-id"].includes("one") ||
      node["resource-id"].includes("two") ||
      node["resource-id"].includes("three") ||
      node["resource-id"].includes("four") ||
      node["resource-id"].includes("five") ||
      node["resource-id"].includes("six") ||
      node["resource-id"].includes("seven") ||
      node["resource-id"].includes("eight") ||
      node["resource-id"].includes("nine") ||
      node["resource-id"].includes("zero") ||
      node["resource-id"].includes("star") ||
      node["resource-id"].includes("pound"))
  ) {
    return "dialpad_button";
  }

  return "view";
}

// ── UI Summary ──────────────────────────────────────────────────────

/**
 * Creates a text summary of interactive elements for debug/display.
 */
export function describeUi(ui: UiElement): string {
  const interactiveElements = findAllInteractiveElements(ui);

  if (interactiveElements.length === 0) {
    return "No interactive elements found.";
  }

  let summary = `Found ${interactiveElements.length} interactive elements:\n`;

  interactiveElements.forEach((el, i) => {
    const parts = [
      el.text ? `"${el.text}"` : "",
      el.desc ? `(${el.desc})` : "",
      el.id ? `[${el.id}]` : "",
      el.type,
      el.focused ? "★focused" : "",
      el.checked ? "✓checked" : "",
      el.enabled === false ? "✗disabled" : "",
    ].filter(Boolean);

    const center = el.parsedBounds
      ? ` → center(${el.parsedBounds.centerX},${el.parsedBounds.centerY})`
      : "";

    summary += `${i + 1}. ${parts.join(" ")} at ${el.bounds}${center}\n`;
  });

  return summary;
}

function findAllInteractiveElements(element: UiElement): UiElement[] {
  let results: UiElement[] = [];

  if (
    element.clickable ||
    element.type === "input" ||
    element.type === "list" ||
    element.scrollable
  ) {
    results.push(element);
  }

  if (element.children) {
    for (const child of element.children) {
      results = results.concat(findAllInteractiveElements(child));
    }
  }

  return results;
}
