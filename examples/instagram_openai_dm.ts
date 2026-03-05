import { autoDroid } from "@/src";
import { openai } from "@ai-sdk/openai";

async function main() {
  process.env.OPENAI_API_KEY = "<your-openai-api-key>";

  const response = await autoDroid({
    task: "Open instagram and go to direct messages, send hi {instagram_username} to the first person",
    llm: openai("gpt-4o"),
  });
  console.log("OpenAI LLM response:", response.text);
}

main();
