// Why: Add input validation to all endpoints — no validation existed before.
import { z } from 'zod';

export const createThesisSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  field: z.string().min(2, 'Field must be at least 2 characters'),
  targetPages: z.coerce.number().int().positive().max(500).default(60),
  researchQuestion: z.string().max(1000).optional(),
  status: z.enum(['draft', 'review', 'completed', 'Generating']).default('draft'),
  progress: z.coerce.number().int().min(0).max(100).default(0),
});

export const updateSectionSchema = z.object({
  content: z.string().max(500_000, 'Content exceeds maximum length'),
  wordCount: z.coerce.number().int().min(0).max(200_000),
});

export const exportQuerySchema = z.object({
  format: z.enum(['docx', 'pdf']).default('docx'),
});

export const queueGenerationSchema = z.object({}).optional();
