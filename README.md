# 🏰 RP-Man — AI Roleplay Character Manager & Discord Hoster

> A sleek, matte-black web app & control panel for creating, managing, and hosting AI Roleplay characters for Discord and the web. Built specifically with **Docker** and **ZimaOS / CasaOS** in mind, featuring local **Ollama** server model management, Tupperbox-style Discord webhook proxying, memory management for low-power servers, Tavern Card V2 import/export, and multi-user administration.

---

## ✨ Key Features

### 🎭 Full RP Character Manager & Tavern V2 Support
- **Character Creator & Editor**: Deep customization including Name, Avatar (upload or URL), Tagline, Description, Personality Traits, Backstory, Scenario, First Message (Greeting), and Alternate Greetings.
- **Tavern Card V2 Support**: Full import and export compatibility with Tavern V2 JSON character cards and embedded `.png` character cards.
- **Prompt Engineering**: Custom system prompts, macros (`{{char}}`, `{{user}}`, `{{scenario}}`, `{{time}}`), and anti-break post-history instructions.
- **Per-Character AI Hyperparameters**: Custom temperature, top_p, max response tokens, repeat penalty, stop sequences, and keep-alive duration.

### 🤖 Discord Bot & Tupperbox Webhook Proxying
- **Tupperbox-Style Proxying**: When users type character triggers (e.g., `aria: hello`, `luna: hey`), RP-Man proxies the message, generates the response, and speaks in the channel using a dynamic Discord Webhook with the character's custom name and avatar.
- **Dedicated Channel Routing**: Map specific Discord channels directly to characters without requiring prefixes.
- **Slash Commands**: `/chat`, `/characters`, `/reset`, `/status`.
- **Direct Webhook Dispatcher**: Direct outbound webhook tester to trigger character messages into any Discord channel.
- **Discord Bot Controls**: Live gateway connect/disconnect/restart buttons, ping latency meter, and guild status.

### 🦙 Ollama Model Hub & Low-RAM Memory Tuning
- **Manage Models from Web UI**: Discover, pull, and delete local Ollama models directly from the web dashboard.
- **RAM & VRAM Memory Monitor**: View active models loaded in memory (`/api/ps`).
- **Instant "Free RAM" Unload**: Unload models from memory immediately (`keep_alive: 0`) to keep low-power ZimaOS / CasaOS servers fast and prevent OOM crashes.
- **1-Click Model Presets**: Fast download presets for lightweight, low-RAM RP models (`llama3.2:1b`, `llama3.2:3b`, `qwen2.5:1.5b`, `qwen2.5:3b`, `dolphin-llama3:8b`, `mistral:7b`, `deepseek-r1:1.5b`).
- **Custom Modelfile Builder**: Build custom Ollama models with pre-baked system prompts and parameters.

### ⚡ Context Window Management & Concurrency Guard
- **Engineered for Low-Power Servers (ZimaOS / Intel N100 / Celerons / ARM)**:
  - **Concurrency Limiter**: Strict request queueing (e.g. 1-2 concurrent generations) to prevent CPU lockups when multiple Discord users chat at once.
  - **Sliding Context Window**: Configurable context token budget (e.g., 2048 to 8192 tokens) preventing memory overflow.
  - **Rolling Summarization**: Automatically summarizes older conversations into a compact memory block.
- **Real-Time Resource HUD**: Live CPU %, RAM MB/GB, Disk %, active Ollama models, and queue status in the navigation bar.

### 🌐 Multiple LLM Providers
- Local **Ollama** (Host or Docker network)
- **OpenRouter** (Cloud)
- **OpenAI** (GPT-4o, GPT-4o-mini)
- **Anthropic** (Claude 3.5 Sonnet, Claude 3 Haiku)
- **Custom OpenAI-Compatible** endpoints (LM Studio, vLLM, LocalAI)

### 📚 World Books & Lorebooks
- Create world lorebooks with keyword-triggered entries.
- Automatically scans user messages and injects relevant world background into the character prompt.

### 💬 Live RP Chat Playground
- In-browser interactive chat to test characters before hosting them on Discord.
- Evocative formatting for roleplay actions (*asterisks*) and dialogue ("quotes").
- **Swipe Alternates**: `← 1/3 →` swipe system to generate or cycle through alternate responses.
- **In-Place Message Editing**: Edit user prompts or AI outputs.
- **Context Inspector**: View compiled system prompts, injected lore, and token budgets.

### 🔐 Multi-User Logins & Security
- User management dashboard: Create users, assign roles (`admin` / `user`), reset passwords.
- Public vs Private character visibility.
- Database backup (1-click JSON export) and disaster recovery restore.
- Real-time SSE live activity and terminal logs.

---

## 🎨 UI Design
- **Matte Black Aesthetics**: Dark theme built with `#09090b` matte black tones, zinc borders, vibrant status pills, and responsive layout for desktop, tablet, and mobile.

---

## 🚀 Quick Start with Docker

### Option 1: Docker Compose (Recommended for ZimaOS & CasaOS)

1. Clone or download the repository:
```bash
git clone https://github.com/denwenged/rp-man.git
cd rp-man
```

2. Start with Docker Compose:
```bash
docker compose up -d --build
```

3. Open your browser at `http://<your-server-ip>:3000`

Default administrator credentials:
- **Username**: `admin`
- **Password**: `admin123` *(Be sure to change this in Settings after first login!)*

---

### Option 2: Docker Run CLI

```bash
docker run -d \
  --name rp-man \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/app/uploads \
  --add-host=host.docker.internal:host-gateway \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  --restart unless-stopped \
  denwenged/rp-man:latest
```

---

## 🖥️ ZimaOS / CasaOS Installation Guide

1. In ZimaOS / CasaOS, open **App Store** → **Custom Install**.
2. Set the following fields:
   - **App Name**: `RP-Man`
   - **Image**: `denwenged/rp-man:latest` (or build locally with Docker Compose)
   - **Web UI Port**: `3000` (Host: `3000` -> Container: `3000`)
   - **Volumes**:
     - Host Path `/DATA/AppData/rp-man/data` -> Container Path `/app/data`
     - Host Path `/DATA/AppData/rp-man/uploads` -> Container Path `/app/uploads`
   - **Environment Variables**:
     - `OLLAMA_HOST` = `http://host.docker.internal:11434`
     - `PORT` = `3000`
3. Click **Install**.
4. Open the web app from the ZimaOS dashboard!

---

## 🤖 Discord Bot Setup Guide

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and give it a name (e.g. `RP-Man`).
3. Navigate to **Bot**:
   - Click **Reset Token** and copy your **Bot Token**.
   - Under **Privileged Gateway Intents**, enable:
     - ✅ **Message Content Intent** (Required to read triggers)
     - ✅ **Server Members Intent**
4. Navigate to **OAuth2** → **URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Manage Webhooks`, `Read Message History`, `Manage Messages` (for Tupperbox deletion)
5. Paste the generated OAuth URL into your browser to invite the bot to your Discord server.
6. In the RP-Man web panel, go to **Discord Bot & Webhooks**, paste your token, and click **Connect Bot**!

---

## 🛠️ Development & Building from Source

```bash
# Install dependencies
npm install

# Build client SPA
npm run build:client

# Run unified server
npm start

# For live development with hot reload:
npm run dev
```

---

## 📄 License
MIT License. Built with ❤️ for AI Roleplayers and Self-Hosters.
