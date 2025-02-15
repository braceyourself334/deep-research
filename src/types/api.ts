import { ResearchProgress } from '../deep-research';

export interface ModelConfig {
  name?: string;      // Model name (e.g., 'gpt-4', 'gpt-3.5-turbo')
  endpoint?: string;  // Optional custom endpoint
  contextSize?: number; // Optional context size override
}

export interface ResearchSession {
  id: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  query: string;
  breadth: number;
  depth: number;
  additionalNotes?: string;  // For report formatting only
  mainPromptNotes?: string;  // Additional context for the main research prompt
  progress: ResearchProgress | null;
  results: {
    learnings: string[];
    visitedUrls: string[];
    report?: string;
  } | null;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StartResearchRequest {
  query: string;
  breadth?: number;
  depth?: number;
  additionalNotes?: string;  // For report formatting only
  mainPromptNotes?: string;  // Additional context for the main research prompt
  model?: {
    name?: string;      // Model name (e.g., 'gpt-4', 'gpt-3.5-turbo')
    endpoint?: string;  // Optional custom endpoint
    contextSize?: number; // Optional context size override
  };
  concurrency?: number;  // Optional concurrency limit for parallel processing
  followUpQuestions?: number; // Optional number of follow-up questions to generate
}

export interface ResearchResponse {
  sessionId: string;
  status: ResearchSession['status'];
  progress?: ResearchProgress;
  results?: ResearchSession['results'];
  error?: string;
}

export type ProgressUpdate = {
  type: 'progress';
  data: ResearchProgress;
} | {
  type: 'completed';
  data: ResearchSession['results'];
} | {
  type: 'error';
  error: string;
} 