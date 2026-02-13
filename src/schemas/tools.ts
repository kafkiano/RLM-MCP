/**
 * Zod schemas for RLM MCP Server tools
 * These tools enable the client's LLM to implement RLM patterns
 */

import { z } from 'zod';
import { ResponseFormat, DecompositionStrategy } from '../types.js';

// ============================================
// Context Management Tools
// ============================================

/**
 * Load context into session
 */
export const LoadContextInputSchema = z.object({
  context: z.string()
    .min(1, 'Context is required')
    .describe('The text content to load'),
  
  context_id: z.string()
    .min(1)
    .max(100)
    .default('main')
    .describe('Unique identifier for this context (default: "main")'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID. If not provided, uses default session')
}).strict();

export type LoadContextInput = z.infer<typeof LoadContextInputSchema>;

/**
 * Get context info/metadata
 */
export const GetContextInfoInputSchema = z.object({
  context_id: z.string()
    .default('main')
    .describe('Context identifier'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID'),
  
  include_preview: z.boolean()
    .default(true)
    .describe('Include content preview'),
  
  preview_length: z.number()
    .int()
    .min(100)
    .max(10000)
    .default(2000)
    .describe('Preview length in characters')
}).strict();

export type GetContextInfoInput = z.infer<typeof GetContextInfoInputSchema>;

/**
 * Read portion of context
 */
export const ReadContextInputSchema = z.object({
  context_id: z.string()
    .default('main')
    .describe('Context identifier'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID'),
  
  start: z.number()
    .int()
    .min(0)
    .default(0)
    .describe('Start position (character offset or line number)'),
  
  end: z.number()
    .int()
    .optional()
    .describe('End position (exclusive)'),
  
  mode: z.enum(['chars', 'lines'])
    .default('chars')
    .describe('Read by character offsets or line numbers')
}).strict();

export type ReadContextInput = z.infer<typeof ReadContextInputSchema>;

// ============================================
// Decomposition Tools
// ============================================

/**
 * Decompose context into chunks
 */
export const DecomposeContextInputSchema = z.object({
  context_id: z.string()
    .default('main')
    .describe('Context identifier'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID'),
  
  strategy: z.nativeEnum(DecompositionStrategy)
    .default(DecompositionStrategy.FIXED_SIZE)
    .describe('Decomposition strategy'),
  
  chunk_size: z.number()
    .int()
    .min(100)
    .max(200000)
    .default(10000)
    .describe('Chunk size in characters (for fixed_size strategy)'),
  
  overlap: z.number()
    .int()
    .min(0)
    .max(10000)
    .default(200)
    .describe('Overlap between chunks'),
  
  lines_per_chunk: z.number()
    .int()
    .min(1)
    .max(10000)
    .default(100)
    .describe('Lines per chunk (for by_lines strategy)'),
  
  pattern: z.string()
    .optional()
    .describe('Regex pattern (for by_regex strategy)'),
  
  return_content: z.boolean()
    .default(false)
    .describe('Include chunk content in response (can be large)')
}).strict();

export type DecomposeContextInput = z.infer<typeof DecomposeContextInputSchema>;

/**
 * Get specific chunk(s)
 */
export const GetChunksInputSchema = z.object({
  context_id: z.string()
    .default('main')
    .describe('Context identifier'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID'),
  
  chunk_indices: z.array(z.number().int().min(0))
    .min(1)
    .max(50)
    .describe('Indices of chunks to retrieve'),
  
  strategy: z.nativeEnum(DecompositionStrategy)
    .default(DecompositionStrategy.FIXED_SIZE)
    .describe('Same strategy used in decompose'),
  
  chunk_size: z.number()
    .int()
    .default(10000)
    .describe('Same chunk_size used in decompose'),
  
  overlap: z.number()
    .int()
    .default(200)
    .describe('Same overlap used in decompose')
}).strict();

export type GetChunksInput = z.infer<typeof GetChunksInputSchema>;

// ============================================
// Search Tools
// ============================================

/**
 * Search context with regex
 */
export const SearchContextInputSchema = z.object({
  context_id: z.string()
    .default('main')
    .describe('Context identifier'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID'),
  
  pattern: z.string()
    .min(1)
    .describe('Regex pattern to search for'),
  
  flags: z.string()
    .default('gi')
    .describe('Regex flags (default: gi for global case-insensitive)'),
  
  context_chars: z.number()
    .int()
    .min(0)
    .max(1000)
    .default(100)
    .describe('Characters of surrounding context to include'),
  
  max_results: z.number()
    .int()
    .min(1)
    .max(500)
    .default(50)
    .describe('Maximum results to return'),
  
  include_line_numbers: z.boolean()
    .default(true)
    .describe('Include line numbers in results')
}).strict();

export type SearchContextInput = z.infer<typeof SearchContextInputSchema>;

/**
 * Find all occurrences of substring
 */
export const FindAllInputSchema = z.object({
  context_id: z.string()
    .default('main')
    .describe('Context identifier'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID'),
  
  substring: z.string()
    .min(1)
    .describe('Substring to find'),
  
  case_sensitive: z.boolean()
    .default(false)
    .describe('Case-sensitive search')
}).strict();

export type FindAllInput = z.infer<typeof FindAllInputSchema>;

// ============================================
// REPL / Code Execution Tools
// ============================================

/**
 * Execute JavaScript code in REPL
 */
export const ExecuteCodeInputSchema = z.object({
  code: z.string()
    .min(1)
    .describe('JavaScript code to execute'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID')
}).strict();

export type ExecuteCodeInput = z.infer<typeof ExecuteCodeInputSchema>;

/**
 * Set variable in session
 */
export const SetVariableInputSchema = z.object({
  name: z.string()
    .min(1)
    .max(100)
    .describe('Variable name'),
  
  value: z.unknown()
    .describe('Variable value (any JSON-serializable value)'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID')
}).strict();

export type SetVariableInput = z.infer<typeof SetVariableInputSchema>;

/**
 * Get variable from session
 */
export const GetVariableInputSchema = z.object({
  name: z.string()
    .min(1)
    .describe('Variable name'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID')
}).strict();

export type GetVariableInput = z.infer<typeof GetVariableInputSchema>;

// ============================================
// Answer Management Tools
// ============================================

/**
 * Set/update answer state
 */
export const SetAnswerInputSchema = z.object({
  content: z.string()
    .describe('Answer content (can be partial or complete)'),
  
  ready: z.boolean()
    .default(false)
    .describe('Mark answer as final/complete'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID')
}).strict();

export type SetAnswerInput = z.infer<typeof SetAnswerInputSchema>;

/**
 * Get current answer state
 */
export const GetAnswerInputSchema = z.object({
  session_id: z.string()
    .optional()
    .describe('Session ID')
}).strict();

export type GetAnswerInput = z.infer<typeof GetAnswerInputSchema>;

// ============================================
// Session Management Tools
// ============================================

/**
 * Create new session
 */
export const CreateSessionInputSchema = z.object({}).strict();

export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

/**
 * List session info
 */
export const GetSessionInfoInputSchema = z.object({
  session_id: z.string()
    .optional()
    .describe('Session ID (uses default if not provided)')
}).strict();

export type GetSessionInfoInput = z.infer<typeof GetSessionInfoInputSchema>;

/**
 * Clear session data
 */
export const ClearSessionInputSchema = z.object({
  session_id: z.string()
    .optional()
    .describe('Session ID')
}).strict();

export type ClearSessionInput = z.infer<typeof ClearSessionInputSchema>;

// ============================================
// Utility Tools
// ============================================

/**
 * Get decomposition suggestion
 */
export const SuggestStrategyInputSchema = z.object({
  context_id: z.string()
    .default('main')
    .describe('Context identifier'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID')
}).strict();

export type SuggestStrategyInput = z.infer<typeof SuggestStrategyInputSchema>;

/**
 * Get context statistics
 */
export const GetStatisticsInputSchema = z.object({
  context_id: z.string()
    .default('main')
    .describe('Context identifier'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID')
}).strict();

export type GetStatisticsInput = z.infer<typeof GetStatisticsInputSchema>;

// ============================================
// GitHub Documentation Tools
// ============================================

/**
 * Get GitHub documentation and load into session
 */
export const GetGitHubDocsInputSchema = z.object({
  url: z.string()
    .url()
    .describe('GitHub URL pointing to documentation directory (e.g., https://github.com/owner/repo/tree/main/docs)'),
  
  context_id: z.string()
    .min(1)
    .max(100)
    .default('github-docs')
    .describe('Context identifier for the loaded documentation'),
  
  session_id: z.string()
    .optional()
    .describe('Session ID (default session if omitted)'),
  
  strategy: z.nativeEnum(DecompositionStrategy)
    .optional()
    .describe('Override decomposition strategy (auto-detected by default)'),
  
  keep_temp: z.boolean()
    .default(false)
    .describe('Keep temporary downloaded files for debugging')
}).strict();

export type GetGitHubDocsInput = z.infer<typeof GetGitHubDocsInputSchema>;
