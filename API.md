# Deep Research API Documentation

The Deep Research API provides endpoints to initiate research queries, track progress in real-time, and retrieve results. This service is designed to work with a locally hosted Firecrawl instance as part of a containerized stack.

## Base URL
```
http://localhost:3005
```

## Authentication
The API requires authentication using an API key. Include the key in the `x-api-key` header with all requests, including WebSocket connections.

```typescript
const headers = {
  'Content-Type': 'application/json',
  'x-api-key': 'your_api_key_here'
};
```

If the API key is missing or invalid:
- REST endpoints will return a `401 Unauthorized` response
- WebSocket connections will be closed with code `1008`

## REST Endpoints

### Health Check
Verifies the API's core dependencies and configuration.

**Endpoint:** `GET /health`

**Response:**
```typescript
// Success (200 OK)
{
  status: 'healthy',
  version: string,  // API version
  uptime: number,   // Server uptime in seconds
}

// Configuration Error (503 Service Unavailable)
{
  status: 'error',
  message: 'Missing required configuration',
  checks: {
    openai: boolean,    // OpenAI configuration status
    firecrawl: boolean, // Firecrawl configuration status
    api: boolean,       // API key configuration status
  }
}

// Connection Error (503 Service Unavailable)
{
  status: 'error',
  message: 'Firecrawl connection failed',
  error?: string  // Error details (in development mode)
}

// Internal Error (500 Internal Server Error)
{
  status: 'error',
  message: 'Health check failed',
  error?: string  // Error details (in development mode)
}
```

**Notes:**
- No authentication required
- Checks for required environment variables
- Tests Firecrawl connectivity
- Useful for container orchestration and monitoring

**Example:**
```typescript
const response = await fetch('http://localhost:3005/health');
const health = await response.json();

if (health.status !== 'healthy') {
  console.error('Service unhealthy:', health.message);
}
```

### Start Research
Initiates a new research session.

**Endpoint:** `POST /api/research`

**Request Body:**
```typescript
{
  query: string;      // Required: The research query
  breadth?: number;   // Optional: Research breadth (1-10, default: 4)
  depth?: number;     // Optional: Research depth (1-5, default: 2)
  additionalNotes?: string;  // Optional: Additional context for report formatting
  mainPromptNotes?: string;  // Optional: Additional context for research direction
  model?: {          // Optional: Model configuration
    name?: string;      // Model name (e.g., 'gpt-4', 'gpt-3.5-turbo')
    endpoint?: string;  // Custom endpoint URL
    contextSize?: number; // Context size override (1000-1000000)
  };
  concurrency?: number;  // Optional: Parallel processing limit (1-10, default from env or 2)
  followUpQuestions?: number; // Optional: Number of follow-up questions per query (1-10, default from env or 3)
}
```

**Notes on Additional Context:**
The API supports two types of additional context:
1. `additionalNotes`: Used only during report generation
   - Influences how the final report is formatted and structured
   - Does not affect the research process or content gathering
   - Best for specifying report preferences and presentation style

2. `mainPromptNotes`: Used during the research process
   - Influences how the research is conducted
   - Affects SERP query generation and research direction
   - Best for providing:
     - Domain-specific context
     - Research methodology preferences
     - Specific areas of focus within the topic

**Model Configuration:**
The API supports customizing the OpenAI model configuration per request:
- If not specified, falls back to environment variables:
  - `OPENAI_MODEL`: Model name (default: 'o3-mini')
  - `OPENAI_ENDPOINT`: API endpoint (default: 'https://api.openai.com/v1')
  - `CONTEXT_SIZE`: Context window size (default: 128000)
- Model configuration in the request overrides environment variables
- Useful for:
  - Testing different models
  - Using custom endpoints
  - Adjusting context size for specific queries

**Performance Configuration:**
The API supports customizing performance parameters per request:
- If not specified, falls back to environment variables:
  - `CONCURRENCY_LIMIT`: Maximum parallel requests (default: 2)
  - `FOLLOW_UP_QUESTIONS`: Questions per query (default: 3)
- Higher concurrency is recommended when using a local Firecrawl instance
- Follow-up questions control research breadth at each depth level
- Useful for:
  - Optimizing performance for your infrastructure
  - Adjusting research thoroughness
  - Balancing speed vs. depth of research

**Response:**
```typescript
{
  sessionId: string;  // Unique identifier for the research session
  status: 'pending' | 'in-progress' | 'completed' | 'error';
}
```

**Example with Both Context Types:**
```typescript
const response = await fetch('http://localhost:3005/api/research', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.API_KEY,
  },
  body: JSON.stringify({
    query: 'What are the latest developments in quantum computing?',
    breadth: 5,
    depth: 3,
    additionalNotes: 'Format the report with a focus on business implications.',
    mainPromptNotes: 'Focus on practical applications and industry adoption rather than theoretical developments.',
    concurrency: 5,
    followUpQuestions: 5,
    model: {
      name: 'gpt-4',
      contextSize: 128000
    }
  }),
});

const { sessionId } = await response.json();
```

### Get Research Status
Retrieves the current status and results of a research session.

**Endpoint:** `GET /api/research/:sessionId`

**Response:**
```typescript
{
  sessionId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  progress?: {
    currentDepth: number;
    totalDepth: number;
    currentBreadth: number;
    totalBreadth: number;
    currentQuery?: string;
    totalQueries: number;
    completedQueries: number;
  };
  results?: {
    learnings: string[];
    visitedUrls: string[];
  };
  error?: string;
}
```

**Example:**
```typescript
const response = await fetch(`http://localhost:3005/api/research/${sessionId}`);
const status = await response.json();
```

## WebSocket Integration

The API provides real-time updates through WebSocket connections. Connect to the WebSocket endpoint with a valid session ID to receive live updates.

### Connection
```typescript
const ws = new WebSocket(`ws://localhost:3005?sessionId=${sessionId}`, {
  headers: {
    'x-api-key': process.env.API_KEY
  }
});
```

### Message Types
The WebSocket connection will emit messages in the following format:

```typescript
type ProgressUpdate = {
  type: 'progress';
  data: {
    currentDepth: number;
    totalDepth: number;
    currentBreadth: number;
    totalBreadth: number;
    currentQuery?: string;
    totalQueries: number;
    completedQueries: number;
  };
} | {
  type: 'completed';
  data: {
    learnings: string[];      // Research findings
    visitedUrls: string[];    // Source URLs
    report: string;           // Final markdown report
  };
} | {
  type: 'error';
  error: string;
};
```

When research completes, you'll receive:
- `learnings`: Array of key findings from the research
- `visitedUrls`: Array of source URLs that were analyzed
- `report`: A comprehensive markdown report that incorporates all findings and any formatting preferences specified in `additionalNotes`

### Example Integration

Here's a complete example of how to integrate with the API using React:

```typescript
import { useEffect, useState } from 'react';

interface ResearchState {
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  progress?: ResearchProgress;
  results?: ResearchResults;
  error?: string;
}

function ResearchComponent() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<ResearchState>({
    status: 'pending'
  });

  // Start research
  const startResearch = async (query: string) => {
    const response = await fetch('http://localhost:3005/api/research', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_KEY,
      },
      body: JSON.stringify({
        query,
        breadth: 4,
        depth: 2,
      }),
    });
    
    const { sessionId } = await response.json();
    setSessionId(sessionId);
  };

  // WebSocket connection for live updates
  useEffect(() => {
    if (!sessionId) return;

    const ws = new WebSocket(`ws://localhost:3005?sessionId=${sessionId}`, {
      headers: {
        'x-api-key': process.env.API_KEY
      }
    });
    
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      
      switch (update.type) {
        case 'progress':
          setState(prev => ({
            ...prev,
            status: 'in-progress',
            progress: update.data,
          }));
          break;
        
        case 'completed':
          setState(prev => ({
            ...prev,
            status: 'completed',
            results: update.data,
          }));
          break;
        
        case 'error':
          setState(prev => ({
            ...prev,
            status: 'error',
            error: update.error,
          }));
          break;
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: 'WebSocket connection error',
      }));
    };
    
    return () => ws.close();
  }, [sessionId]);

  return (
    <div>
      {/* Render your research UI here */}
      {state.status === 'in-progress' && state.progress && (
        <div>
          <div>Depth: {state.progress.currentDepth}/{state.progress.totalDepth}</div>
          <div>Breadth: {state.progress.currentBreadth}/{state.progress.totalBreadth}</div>
          <div>Queries: {state.progress.completedQueries}/{state.progress.totalQueries}</div>
          {state.progress.currentQuery && (
            <div>Current Query: {state.progress.currentQuery}</div>
          )}
        </div>
      )}
      
      {state.status === 'completed' && state.results && (
        <div>
          <h2>Research Results</h2>
          
          {/* Raw Findings */}
          <h3>Key Learnings:</h3>
          <ul>
            {state.results.learnings.map((learning, i) => (
              <li key={i}>{learning}</li>
            ))}
          </ul>
          
          {/* Sources */}
          <h3>Sources:</h3>
          <ul>
            {state.results.visitedUrls.map((url, i) => (
              <li key={i}><a href={url}>{url}</a></li>
            ))}
          </ul>

          {/* Formatted Report */}
          <h3>Full Report:</h3>
          <div className="markdown-content">
            {/* Use your preferred markdown renderer here */}
            <MarkdownRenderer content={state.results.report} />
          </div>
        </div>
      )}
      
      {state.status === 'error' && (
        <div className="error">
          Error: {state.error}
        </div>
      )}
    </div>
  );
}
```

## Error Handling

The API uses standard HTTP status codes:
- `200`: Success
- `400`: Bad Request (invalid input)
- `404`: Not Found (invalid session ID)
- `500`: Internal Server Error

Error responses follow this format:
```typescript
{
  error: string;
  message?: string;  // Additional details in development mode
}
```

## Environment Variables

The API requires the following environment variables:
```
# Firecrawl Configuration (Local Instance)
FIRECRAWL_BASE_URL=http://localhost:3002  # URL of your local Firecrawl instance

# API Configuration
PORT=3005  # Optional, defaults to 3005
API_KEY=your_api_key_here  # Required for authentication
NODE_ENV=development  # Optional, affects error message verbosity
```

## Container Stack Integration

This service is designed to be part of a containerized stack including:
1. This Deep Research API (port 3005)
2. Local Firecrawl instance (port 3002)
3. Your React/Node.js web application

Ensure your container orchestration (docker-compose or similar) maintains these port mappings and network connectivity between services.

Example container configuration:
```yaml
services:
  deep-research:
    # ... container config ...
    environment:
      - FIRECRAWL_BASE_URL=http://firecrawl:3002
      - API_KEY=your_api_key_here
      - PORT=3005
    ports:
      - "3005:3005"

  firecrawl:
    # ... firecrawl container config ...
    ports:
      - "3002:3002"

  webapp:
    # ... your web app container config ...
    environment:
      - DEEP_RESEARCH_API_KEY=your_api_key_here
    ports:
      - "3000:3000"
```

## Rate Limiting and Concurrency

- The API currently processes research queries with a concurrency limit of 2
- Consider implementing rate limiting if deploying to production
- Research parameters are limited to:
  - Breadth: 1-10 (default: 4)
  - Depth: 1-5 (default: 2)