<div align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/graduation-cap.svg" alt="Thesium Logo" width="80" height="80">
  
  # Thesium

  **An Intelligent, Full-Stack Thesis Generation & Workspacing Platform**

  [![React](https://img.shields.io/badge/React-18.x-blue?style=flat-square&logo=react)](https://reactjs.org/)
  [![Vite](https://img.shields.io/badge/Vite-5.x-purple?style=flat-square&logo=vite)](https://vitejs.dev/)
  [![Express.js](https://img.shields.io/badge/Express-5.x-lightgrey?style=flat-square&logo=express)](https://expressjs.com/)
  [![Prisma](https://img.shields.io/badge/Prisma-6.x-1B222D?style=flat-square&logo=prisma)](https://www.prisma.io/)
  [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?style=flat-square&logo=postgresql)](https://neon.tech/)
  [![OpenRouter API](https://img.shields.io/badge/AI-gpt--4o-00A67E?style=flat-square&logo=openai)](https://openrouter.ai/)
</div>

---

## 📖 Overview

**Thesium** is an intelligent, full-stack unified platform engineered to help students, researchers, and academics streamline the complex process of conceptualizing, structuring, and writing their thesis papers. 

Powered by OpenAI's flagship `gpt-4o` model via OpenRouter, Thesium offers dynamic AI content scaling, rich text work-spacing, instantaneous cloud persistence, and a highly polished modern user interface.

## ✨ Core Features

- **🔐 Google OAuth Authentication:** Secure, robust login integrated directly with Google accounts, orchestrating seamless user profile synchronization.
- **📊 Interactive Dashboard:** A comprehensive command center to manage ongoing projects, toggle elegant Dark/Light modes, and visualize academic progress metrics against target page counts.
- **🤖 Intelligent Thesis Engine:** Users declare an Academic Field, Research Topic, and Target Length. Thesium's custom system framing auto-generates deep contextual structures to drive the AI.
- **✍️ Distraction-Free Workspace:** A Notion-inspired rich-text editor painstakingly customized for long-form academic writing. Equipped with aggressive, debounced auto-saving architectures ensuring absolute data integrity.
- **⚡ Dynamic AI Scaling:** By initiating a generation sequence, Thesium leverages `gpt-4o` combined with rigorous academic structuring constraints (Abstract, Introduction, Literature Review, Methodology, Results, Discussion, Conclusion). It precisely scales the output word count relative to the overarching target page goals.
- **☁️ Serverless Data Persistence:** Every keystroke and piece of AI-generated prose is securely transacted to a fully-managed Neon Serverless PostgreSQL Database via the Prisma ORM.

## 🏗️ Architecture

The application implements a decoupled client-server architecture:

```mermaid
graph TD
    Client[React/Vite Frontend] -->|REST API| Express[Node.js/Express Backend]
    Express -->|Prisma ORM| Neon[(Neon PostgreSQL DB)]
    Express -->|LLM Prompts| OpenRouter[OpenRouter AI / GPT-4o]
```

### Relational Schema (Prisma)
- **`User`**: Tracks Google Authentication identities and metadata.
- **`Thesis`**: Defines the overarching project constraints (`targetPages`, `field`, `researchQuestion`).
- **`Section`**: Granular, ordered child records tied to a specific `Thesis` containing dynamic `wordCount` tracking and raw Markdown `content`.

## 🚀 Getting Started

Follow these instructions to provision a local development environment.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A [PostgreSQL](https://www.postgresql.org/) database (e.g., [Neon.tech](https://neon.tech/))
- An [OpenRouter API Key](https://openrouter.ai/)
- A [Google Cloud Console](https://console.cloud.google.com/) OAuth Client ID

### Installation Pipeline

1. **Clone the Repository**
   ```bash
   git clone https://github.com/Ragulvl/Thesium.git
   cd Thesium
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Protocol**
   Provision a `.env` file in the root directory mirroring the necessary configuration keys:
   ```env
   # Relational Database String
   DATABASE_URL="postgresql://user:password@hostname/dbname?sslmode=require"

   # Client Identification
   VITE_GOOGLE_CLIENT_ID="your_google_oauth_client_id"

   # Artificial Intelligence
   OPENROUTER_API_KEY="sk-or-v1-..."

   # Server Daemon Config
   PORT=3001
   NODE_ENV=development
   ```

4. **Synchronize Database Schema**
   Initialize the Prisma client and push the schema to your remote Postgres instance:
   ```bash
   npx prisma db push
   npx prisma generate
   ```

5. **Initialize Application Servers**
   Thesium uses `concurrently` to launch the Vite dev server and the Nodemon Express backend simultaneously:
   ```bash
   npm run dev
   ```
   *Frontend Client:* `http://localhost:5173` | *Backend API:* `http://localhost:3001`

## 🛡️ Best Practices & Quality Assurance

- **Production Grade Logging:** Express API traffic and critical state mutations are monitored and formatted via `pino` and `pino-http`.
- **Strict Typing:** The entire technology stack asserts 100% strict TypeScript compliance for enhanced resilience.
- **Atomic Operations:** Database interactions are safely isolated utilizing Prisma's transactional guarantees.

## 📄 License

This repository is licensed under the [MIT License](LICENSE).
