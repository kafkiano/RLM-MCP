/**
 * RLM MCP Server Constants
 */

// Server info
export const SERVER_NAME = 'rlm-mcp-server';
export const SERVER_VERSION = '2.0.0';

// Response limits
export const CHARACTER_LIMIT = 100000;      // Max response size
export const MAX_REPL_OUTPUT = 50000;       // Max REPL output per execution

// Context limits  
export const MAX_CONTEXT_PREVIEW = 5000;    // Default preview length
export const MAX_SEARCH_RESULTS = 500;      // Max search results

// Chunking defaults
export const DEFAULT_CHUNK_SIZE = 10000;    // Characters per chunk
export const DEFAULT_OVERLAP = 500;         // Overlap between chunks (increased from 200 for better cross-chunk pattern matching)
export const DEFAULT_LINES_PER_CHUNK = 100; // Lines per chunk

// GitIngest-specific defaults (smaller for selective retrieval)
export const GITINGEST_CHUNK_SIZE = 2000;     // 2k chars for GitIngest content
export const GITINGEST_OVERLAP = 100;         // 100 chars overlap for GitIngest
export const GITINGEST_LINES_PER_CHUNK = 50;  // 50 lines for GitIngest

// Code execution
export const CODE_EXECUTION_TIMEOUT_MS = 30000;  // 30 seconds

// Session management
export const SESSION_TIMEOUT_MS = 3600000;  // 1 hour
export const MAX_SESSIONS = 100;            // Max concurrent sessions
