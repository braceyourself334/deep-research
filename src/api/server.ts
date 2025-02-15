import express, { Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as process from 'process';
import cors from 'cors';
import { z } from 'zod';

import { deepResearch, writeFinalReport } from '../deep-research';
import { OutputManager } from '../output-manager';
import { ResearchSession, StartResearchRequest, ProgressUpdate } from '../types/api';

// Input validation schemas
const startResearchSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  breadth: z.number().min(1).max(10).optional(),
  depth: z.number().min(1).max(5).optional(),
  additionalNotes: z.string().optional(),
  mainPromptNotes: z.string().optional(),
  model: z.object({
    name: z.string().optional(),
    endpoint: z.string().url().optional(),
    contextSize: z.number().min(1000).max(1000000).optional(),
  }).optional(),
  concurrency: z.number().min(1).max(10).optional(),  // Max 10 concurrent requests
  followUpQuestions: z.number().min(1).max(10).optional(), // Max 10 follow-up questions
});

// Authentication middleware
const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    console.error('API_KEY environment variable is not set');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  next();
};

// WebSocket authentication
const authenticateWs = (req: Request): boolean => {
  const apiKey = req.headers['x-api-key'];
  const expectedApiKey = process.env.API_KEY;

  return !!expectedApiKey && !!apiKey && apiKey === expectedApiKey;
};

// Error handling middleware
const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

const sessions = new Map<string, ResearchSession>();
const progressSubscribers = new Map<string, Set<WebSocket>>();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api', authenticate); // Apply authentication to all /api routes

// Create HTTP server
const server = new Server(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// WebSocket connection handler
wss.on('connection', (ws: WebSocket, req: Request) => {
  try {
    if (!authenticateWs(req)) {
      ws.close(1008, 'Invalid API key');
      return;
    }

    const url = new URL(req.url!, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId || !sessions.has(sessionId)) {
      ws.close(1008, 'Invalid session ID');
      return;
    }
    
    // Add subscriber to session
    let subscribers = progressSubscribers.get(sessionId);
    if (!subscribers) {
      subscribers = new Set();
      progressSubscribers.set(sessionId, subscribers);
    }
    subscribers.add(ws);
    
    // Send initial state
    const session = sessions.get(sessionId)!;
    const initialUpdate: ProgressUpdate = session.results 
      ? { type: 'completed', data: session.results }
      : session.progress 
        ? { type: 'progress', data: session.progress }
        : { type: 'progress', data: { currentDepth: 0, totalDepth: session.depth, currentBreadth: 0, totalBreadth: session.breadth, completedQueries: 0, totalQueries: 0 } };
    
    ws.send(JSON.stringify(initialUpdate));
    
    // Remove subscriber when connection closes
    ws.on('close', () => {
      const subs = progressSubscribers.get(sessionId);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) {
          progressSubscribers.delete(sessionId);
        }
      }
    });
  } catch (error) {
    console.error('WebSocket connection error:', error);
    ws.close(1011, 'Internal server error');
  }
});

// Start research endpoint
app.post('/api/research', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = startResearchSchema.parse(req.body);
    const { query, breadth = 4, depth = 2, additionalNotes, mainPromptNotes, model, concurrency, followUpQuestions } = validatedData;
    
    const sessionId = uuidv4();
    const session: ResearchSession = {
      id: sessionId,
      status: 'pending',
      query,
      breadth,
      depth,
      additionalNotes,
      mainPromptNotes,
      progress: null,
      results: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    sessions.set(sessionId, session);
    
    // Create headless output manager for this session
    const output = new OutputManager({
      headless: true,
      onOutput: (message) => {
        const subscribers = progressSubscribers.get(sessionId);
        if (subscribers) {
          const update: ProgressUpdate = {
            type: 'progress',
            data: session.progress!
          };
          subscribers.forEach(ws => ws.send(JSON.stringify(update)));
        }
      },
      onProgress: (progress) => {
        session.progress = progress;
        session.updatedAt = new Date();
        session.status = 'in-progress';
        
        const subscribers = progressSubscribers.get(sessionId);
        if (subscribers) {
          const update: ProgressUpdate = {
            type: 'progress',
            data: progress
          };
          subscribers.forEach(ws => ws.send(JSON.stringify(update)));
        }
      }
    });
    
    // Combine query with additional notes if provided
    const enhancedQuery = additionalNotes 
      ? `${query}\n\nAdditional Context:\n${additionalNotes}`
      : query;
    
    // Start research in background with optional model configuration
    deepResearch({
      query: enhancedQuery,
      breadth,
      depth,
      onProgress: (progress) => output.updateProgress(progress),
      model,
      concurrency,
      followUpQuestions,
    }).then(async results => {
      // Generate the final report
      const report = await writeFinalReport({
        prompt: enhancedQuery,
        learnings: results.learnings,
        visitedUrls: results.visitedUrls,
        model,
      });
      
      session.results = {
        ...results,
        report,
      };
      session.status = 'completed';
      session.updatedAt = new Date();
      
      const subscribers = progressSubscribers.get(sessionId);
      if (subscribers) {
        const update: ProgressUpdate = {
          type: 'completed',
          data: session.results
        };
        subscribers.forEach(ws => ws.send(JSON.stringify(update)));
      }
    }).catch(error => {
      session.status = 'error';
      session.error = error.message;
      session.updatedAt = new Date();
      
      const subscribers = progressSubscribers.get(sessionId);
      if (subscribers) {
        const update: ProgressUpdate = {
          type: 'error',
          error: error.message
        };
        subscribers.forEach(ws => ws.send(JSON.stringify(update)));
      }
    });
    
    res.json({
      sessionId,
      status: session.status
    });
  } catch (error) {
    next(error);
  }
});

// Get research status endpoint
app.get('/api/research/:sessionId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required' });
      return;
    }
    
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    res.json({
      sessionId: session.id,
      status: session.status,
      progress: session.progress,
      results: session.results,
      error: session.error
    });
  } catch (error) {
    next(error);
  }
});

// Error handling middleware must be after all routes
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 