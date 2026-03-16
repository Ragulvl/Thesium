# 🎓 Thesium

> **Thesium** is an intelligent, full-stack unified platform designed to help students, researchers, and academics streamline the process of conceptualizing, structuring, and writing their thesis papers. Powered by OpenAI's newest flagship model (`gpt-4o`) via OpenRouter, it features dynamic AI generation, rich text work-spacing, and instant cloud persistence.

---

## ✨ Key Features

- **Google OAuth Authentication**: Secure login integrated directly with Google accounts, syncing user profiles gracefully via a dedicated `contexts` wrapper.
- **Project Dashboard**: A beautiful, intuitive home interface to manage ongoing theses, toggle Dark/Light mode, and track total words written against a target page count.
- **AI Thesis Configuration**: Users can input their Academic Field, Research Topic, and Target Pages. Custom system algorithms will auto-generate focus areas and prep the AI context.
- **Thesis Workspace**: A Notion-like rich-text editor customized for long-form academic writing. Features robust auto-saving architectures to prevent data loss.
- **Dynamic Content Generation**: By clicking "Generate", Thesium directly prompts `gpt-4o` with a locked structural formula (Abstract, Introduction, Literature Review, Methodology, Results, Discussion, Conclusion). It dynamically scales the word count based on your specific target page goal and immediately persists the data.
- **End-to-End Persistence**: Everything typed or AI-generated is safely written to a fully managed Neon Serverless Postgres Database via Prisma ORM. 

## 🛠️ Technology Stack

**Frontend**
- React 18
- Vite
- TypeScript
- Tailwind CSS 
- React Router DOM
- React Google OAuth
- Lucide React (Icons)

**Backend**
- Node.js & Express
- Prisma (ORM)
- PostgreSQL (Neon Database)
- OpenRouter API (OpenAI GPT-4o)
- Pino Logger (Production-grade HTTP and application logging)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- A PostgreSQL database (e.g., Neon)
- An OpenRouter API Key
- Google OAuth Client ID

### 1. Clone the Repository
```bash
git clone https://github.com/Ragulvl/Thesium.git
cd Thesium
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory and add the following keys:
```env
# Database
DATABASE_URL="your-neon-postgres-connection-string"

# Google Auth
VITE_GOOGLE_CLIENT_ID="your-google-client-id"

# AI Generation
OPENROUTER_API_KEY="your-openrouter-api-key"

# Server
PORT=3001
NODE_ENV=development
```

### 4. Database Setup
Sync the Prisma schema with your database to build the `User`, `Thesis`, and `Section` tables:
```bash
npx prisma db push
npx prisma generate
```

### 5. Run the Application
The package is wired with `concurrently` to spin up both the Vite frontend and Node backend together seamlessly:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173` and the API will run on `http://localhost:3001`.

---

## 🗄️ Database Architecture

Thesium utilizes a three-tier relational schema:
- **`User`**: Stores Google Authentication profiles.
- **`Thesis`**: Tracks broad project metadata (Target Pages, Field, Research Question).
- **`Section`**: Granular one-to-many chapters linked to a specific Thesis (containing Word Counts, ordering, and the actual Markdown content).

---

## 📝 License
This project is open-source and available under the MIT License.
