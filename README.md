<div align="center">

# 🤖 AutoDroid AI
**Use AI to control your Android phone — with natural language.**

</div>

---

## ✨ What is this?

**AutoDroid AI** lets you control your Android phone using simple, natural-language instructions.

Just type:

> 🗣 *"Open Instagram, go to DMs, and send 'hi' to the first person."*

…and watch it run on your device — powered by AI.

Think RPA, but for mobile — built for devs, hackers, and productivity nerds.

---

## 🚀 Setup & Manual Run

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Project
```bash
npm run build
```

---

## 🧠 AI in Action

```ts
import { autoDroid } from "./src"; // Local import

const response = await autoDroid({
  task: "Open instagram and go to direct messages, send hi to first person",
});

console.log(response.text);
```

> Default model: Gemini 3 Flash Preview (via Google).
> Set `GOOGLE_GENERATIVE_AI_API_KEY` in your `.env` or environment to use it.
> You can also use Anthropic, Google, Azure, or OpenRouter.

---

## 🖥️ Command Line Usage

```bash
# Run a task directly from your terminal
./bin/run "Open Instagram and send 'hi'"

# Run a task from a file
./bin/run instruction.txt

# Use a different LLM provider
./bin/run "Open Settings" --llm anthropic

# Enable verbose logging
./bin/run "Open Settings" -v
```

### CLI Options

| Flag | Description | Default |
|---|---|---|
| `--llm`, `-l` | LLM provider (openai, anthropic, google, azure, openrouter) | `openai` |
| `--model`, `-m` | Model name (e.g., gpt-4o, claude-3-5-sonnet) | Provider default |
| `--max-steps` | Maximum AI steps | `100` |
| `--verbose`, `-v` | Enable verbose logging | `false` |
| `--device`, `-d` | Target ADB device serial | Auto-detect |

---

## 📱 Requirements

- Android phone or Emulator running in background (iOS not supported yet)
- [Android SDK Platform Tools](https://developer.android.com/studio/releases/platform-tools) installed (`adb`)
- USB Debugging enabled

---

## 📄 License

MIT — free to use, fork, and build on.