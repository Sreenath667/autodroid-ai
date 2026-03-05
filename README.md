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

## 🚀 Quick Start

### 📦 Install via npm

```bash
npm install autodroid-ai
```

---

## 🧠 AI in Action

```ts
import { autoDroid } from "autodroid-ai";

const response = await autoDroid({
  task: "Open instagram and go to direct messages, send hi to first person",
});

console.log(response.text);
```

> Default model: GPT-4o (via OpenAI).
> Set `OPENAI_API_KEY` in your `.env` or environment to use it.
> You can also use Anthropic, Google, Azure, or OpenRouter.

---

## 🖥️ Command Line Usage

```bash
# Run a task directly from your terminal
npx autodroid-ai "Open Instagram and send 'hi'"

# Run a task from a file
npx autodroid-ai instruction.txt

# Use a different LLM provider
npx autodroid-ai "Open Settings" --llm anthropic

# Enable verbose logging
npx autodroid-ai "Open Settings" -v
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

## 🧩 What's Coming Next?

- iOS support (experimental)
- Visual workflows
- Common protocol for mobiles, browsers and computers

---

## 📄 License

MIT — free to use, fork, and build on.