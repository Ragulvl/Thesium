import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import pinoHttp from 'pino-http';
import OpenAI from 'openai';
import "dotenv/config";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI client for OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "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",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:10000", // Optional, for including your app on openrouter.ai rankings.
    "X-Title": "Thesium", // Optional. Shows in rankings on openrouter.ai.
  }
});

// Setup Production Grade Logger
const baseLogger = pino({
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'",
      ignore: 'pid,hostname'
    }
  } : undefined,
});

const logger = pinoHttp({ logger: baseLogger });

app.use(logger);
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  req.log.info('Health check pinged');
  res.json({ status: 'ok', database: 'connected' });
});

// Sync User endpoint (called on Google Login)
app.post('/api/users/sync', async (req, res) => {
  try {
    const { id, email, name, picture } = req.body;
    
    if (!id || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = await prisma.user.upsert({
      where: { id },
      update: { name, picture }, // Update profile details if they changed
      create: { id, email, name, picture }
    });

    req.log.info({ userId: user.id }, 'User synced to database');
    res.status(200).json(user);
  } catch (error) {
    req.log.error({ err: error }, 'Failed to sync user');
    res.status(500).json({ error: 'Failed to sync user to database' });
  }
});

// Example Thesis endpoints
app.get('/api/theses/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const theses = await prisma.thesis.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    });
    req.log.info({ userId, count: theses.length }, 'Fetched theses for user');
    res.json(theses);
  } catch (error) {
    req.log.error({ err: error }, 'Failed to fetch theses');
    res.status(500).json({ error: 'Failed to fetch theses' });
  }
});

// Create Thesis endpoint
app.post('/api/theses', async (req, res) => {
  try {
    const { userId, title, field, targetPages, researchQuestion, status, progress } = req.body;
    
    // Basic validation
    if (!userId || !title || !field) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newThesis = await prisma.thesis.create({
      data: {
        userId,
        title,
        field,
        targetPages: targetPages || 60,
        researchQuestion,
        status: status || 'draft',
        progress: progress || 0,
      }
    });

    req.log.info({ thesisId: newThesis.id, userId }, 'Created new thesis');
    res.status(201).json(newThesis);
  } catch (error) {
    req.log.error({ err: error }, 'Failed to create thesis');
    res.status(500).json({ error: 'Failed to create thesis' });
  }
});

// --- SECTION & AI GENERATION ENDPOINTS ---

const DEFAULT_SECTIONS = [
  { id: 'title',         label: 'Title Page' },
  { id: 'abstract',      label: 'Abstract' },
  { id: 'toc',           label: 'Table of Contents' },
  { id: 'introduction',  label: 'Introduction' },
  { id: 'literature',    label: 'Literature Review' },
  { id: 'methodology',   label: 'Methodology' },
  { id: 'results',       label: 'Results' },
  { id: 'discussion',    label: 'Discussion' },
  { id: 'conclusion',    label: 'Conclusion' },
  { id: 'references',    label: 'References' },
];

app.get('/api/theses/:thesisId/sections', async (req, res) => {
  try {
    const { thesisId } = req.params;
    
    // Check if sections already exist
    let sections = await prisma.section.findMany({
      where: { thesisId },
      orderBy: { order: 'asc' }
    });

    // If no sections exist (first time opening workspace), seed them
    if (sections.length === 0) {
      req.log.info({ thesisId }, 'Seeding default sections for thesis');
      await prisma.$transaction(
        DEFAULT_SECTIONS.map((sec, idx) => 
          prisma.section.create({
            data: {
              thesisId,
              id: sec.id,
              label: sec.label,
              order: idx,
              content: '',
              wordCount: 0
            }
          })
        )
      );
      sections = await prisma.section.findMany({
        where: { thesisId },
        orderBy: { order: 'asc' }
      });
    }

    res.json(sections);
  } catch (error) {
    req.log.error({ err: error }, 'Failed to fetch/seed sections');
    res.status(500).json({ error: 'Failed to load sections' });
  }
});

// Auto-save endpoint for typing in the Workspace
app.patch('/api/theses/:thesisId/sections/:sectionId', async (req, res) => {
  try {
    const { thesisId, sectionId } = req.params;
    const { content, wordCount } = req.body;

    const updated = await prisma.section.update({
      where: { thesisId_id: { thesisId, id: sectionId } },
      data: { content, wordCount }
    });

    res.json(updated);
  } catch (error) {
    req.log.error({ err: error }, 'Failed to auto-save section');
    res.status(500).json({ error: 'Failed to save section' });
  }
});

// AI Generation Endpoint using OpenRouter
app.post('/api/theses/:thesisId/sections/:sectionId/generate', async (req, res) => {
  try {
    const { thesisId, sectionId } = req.params;

    // Fetch the thesis config to feed the AI
    const thesis = await prisma.thesis.findUnique({
      where: { id: thesisId }
    });

    if (!thesis) return res.status(404).json({ error: 'Thesis not found' });

    // Fetch the specific section label
    const section = await prisma.section.findUnique({
      where: { thesisId_id: { thesisId, id: sectionId } }
    });

    if (!section) return res.status(404).json({ error: 'Section not found' });

    const systemPrompt = `You are an academic thesis generation engine working inside a platform called **Thesium**. Your task is to generate professional, well-structured academic thesis content based on a user-provided topic and required number of pages.

GENERAL REQUIREMENTS
• Write in formal academic English.
• Maintain logical flow between chapters.
• Avoid repetition and filler text.
• Ensure each chapter contributes to answering the research question.
• Expand content naturally so that the final document realistically fills the requested number of pages.
• Use clear headings and subheadings.

PAGE DISTRIBUTION RULE
The approximate distribution should follow this pattern:
Front Matter (Title, Abstract, TOC) → 5%
Introduction → 12%
Literature Review → 30%
Methodology → 20%
Results → 18%
Discussion → 10%
Conclusion → 4%
References → 1%

FORMATTING RULES
• Use hierarchical headings (H1, H2, H3) using Markdown.
• Maintain academic paragraph structure.
• Avoid bullet-heavy writing inside main chapters.
• Ensure consistent terminology throughout the thesis.
• DO NOT wrap your entire response in a markdown code block. Return raw markdown text directly.`;

    const instructions = `Generate ONLY the content for the section titled: "${section.label}".
Research Topic: ${thesis.title}
Academic Field: ${thesis.field}
Research Question: ${thesis.researchQuestion || 'Not specified'}
Target Total Thesis Pages: ${thesis.targetPages}

Scale your writing specifically for this section based on the total target pages (${thesis.targetPages}) and the Page Distribution Rule.
Do not include content meant for other sections. Write it in Markdown.`;

    req.log.info({ thesisId, sectionId, model: 'gpt-4o' }, 'Requesting generation from OpenRouter');

    const completion = await openai.chat.completions.create({
      model: "openai/gpt-4o-2024-11-20", // Use standard flagship model via OpenRouter
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: instructions }
      ]
    });

    const generatedContent = completion.choices[0]?.message?.content || "";
    const generatedWordCount = generatedContent.split(/\s+/).filter(Boolean).length;

    // Persist to database immediately
    const updatedSection = await prisma.section.update({
      where: { thesisId_id: { thesisId, id: sectionId } },
      data: {
        content: generatedContent,
        wordCount: generatedWordCount
      }
    });

    req.log.info({ thesisId, sectionId, words: generatedWordCount }, 'Generated and saved content successfully');
    res.json(updatedSection);

  } catch (error) {
    req.log.error({ err: error }, 'Failed to dynamically generate section');
    res.status(500).json({ error: 'AI Error: Failed to generate section content' });
  }
});

app.listen(PORT, () => {
  baseLogger.info(`🚀 [Backend API] Server successfully started and running on http://localhost:${PORT}`);
});
