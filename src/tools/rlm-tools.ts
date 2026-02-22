/**
 * RLM MCP Server Tools
 * 
 * These tools provide infrastructure for implementing RLM patterns.
 * The client's LLM uses these tools to:
 * 1. Load and manage long contexts
 * 2. Decompose contexts into chunks
 * 3. Search and navigate content
 * 4. Execute code for data manipulation
 * 5. Build up answers incrementally
 * 
 * The LLM itself performs the recursive reasoning - this server
 * provides the scaffolding.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sessionManager } from '../services/session-manager.js';
import { contextProcessor } from '../services/context-processor.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  LoadContextInputSchema,
  LoadFileInputSchema,
  GetContextInfoInputSchema,
  ReadContextInputSchema,
  DecomposeContextInputSchema,
  GetChunksInputSchema,
  SearchContextInputSchema,
  FindAllInputSchema,
  ExecuteCodeInputSchema,
  SetVariableInputSchema,
  GetVariableInputSchema,
  SetAnswerInputSchema,
  GetAnswerInputSchema,
  CreateSessionInputSchema,
  GetSessionInfoInputSchema,
  ClearSessionInputSchema,
  SuggestStrategyInputSchema,
  GetStatisticsInputSchema,
  GetGitIngestInputSchema,
  type LoadContextInput,
  type LoadFileInput,
  type GetContextInfoInput,
  type ReadContextInput,
  type DecomposeContextInput,
  type GetChunksInput,
  type SearchContextInput,
  type FindAllInput,
  type ExecuteCodeInput,
  type SetVariableInput,
  type GetVariableInput,
  type SetAnswerInput,
  type GetAnswerInput,
  type CreateSessionInput,
  type GetSessionInfoInput,
  type ClearSessionInput,
  type SuggestStrategyInput,
  type GetStatisticsInput,
  type GetGitIngestInput
} from '../schemas/tools.js';
import { CHARACTER_LIMIT } from '../constants.js';
import { runGitIngest } from '../utils/gitingest-adapter.js';

/**
 * Register all RLM tools with the MCP server
 */
export function registerRLMTools(server: McpServer): void {

  // ============================================
  // Context Management Tools
  // ============================================

  server.registerTool(
    'rlm_load_context',
    {
      title: 'Load Context',
      description: `Load text content into the RLM session for processing.

Supports both direct content string and server-side file loading.

This is typically the first step in RLM processing. Load your long context here,
then use other tools to decompose, search, and analyze it.

The context is stored in the session and can be referenced by its ID in other tools.

Example workflow:
1. rlm_load_context - Load your document (via context string or file_path)
2. rlm_get_context_info - Understand structure and size
3. rlm_decompose_context - Split into manageable chunks
4. rlm_search_context - Find relevant sections
5. rlm_read_context - Read specific portions
6. rlm_set_answer - Build up your response`,
      inputSchema: LoadContextInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: LoadContextInput) => {
      const session = params.session_id
        ? sessionManager.getSession(params.session_id)
        : sessionManager.getDefaultSession();
      
      if (!session) {
        return {
          content: [{ type: 'text', text: 'Error: Session not found' }]
        };
      }

      let content: string;
      
      // Load from file if file_path provided
      if (params.file_path) {
        const fullPath = path.resolve(process.cwd(), params.file_path);
        
        // Security: Ensure path is within workspace directory
        const workspaceDir = process.cwd();
        if (!fullPath.startsWith(workspaceDir)) {
          return {
            content: [{ type: 'text', text: `Error: Access denied: Path "${params.file_path}" is outside workspace directory` }]
          };
        }
        
        // Read file content
        try {
          content = await fs.readFile(fullPath, 'utf-8');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            content: [{ type: 'text', text: `Error: Failed to read file "${params.file_path}": ${errorMessage}` }]
          };
        }
      } else {
        // Use provided context string
        content = params.context!;
      }

      const contextItem = sessionManager.loadContext(
        session.id,
        params.context_id,
        content
      );

      const output = {
        success: true,
        context_id: params.context_id,
        session_id: session.id,
        ...(params.file_path && { file_path: params.file_path }),
        metadata: contextItem.metadata
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'rlm_load_file',
    {
      title: 'Load File',
      description: `Load file content into the RLM session (server-side file reading).

This tool reads files directly on the server without requiring the LLM to read them first.
This prevents context pollution when loading large files.

The file path is relative to the workspace directory. Only files within the workspace
can be loaded for security reasons.

Optional filetype parameter enables specialized processing:
- 'gitingest': Auto-parse GitIngest digest files with metadata extraction and auto-decomposition

Example workflow for GitIngest digest:
1. Generate digest locally: gitingest ./ -o tmp/digest.txt
2. Load with auto-decomposition: rlm_load_file { file_path: "tmp/digest.txt", filetype: "gitingest" }
3. Search: rlm_search_context
4. Read specific portions: rlm_read_context`,
      inputSchema: LoadFileInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: LoadFileInput) => {
      const session = params.session_id
        ? sessionManager.getSession(params.session_id)
        : sessionManager.getDefaultSession();
      
      if (!session) {
        return {
          content: [{ type: 'text', text: 'Error: Session not found' }]
        };
      }

      try {
        const contextItem = await sessionManager.loadContextFromFile(
          session.id,
          params.context_id,
          params.file_path
        );

        // Handle GitIngest filetype with auto-decomposition
        if (params.filetype === 'gitingest') {
          const content = contextItem.content;
          
          // Validate GitIngest output structure
          const hasDirectoryTree = content.includes('Directory structure:');
          const hasFileContent = content.includes('FILE:') || content.includes('===') || content.includes('---');
          
          if (!hasDirectoryTree || !hasFileContent) {
            return {
              content: [{ type: 'text', text: `Error: File "${params.file_path}" does not appear to be a valid GitIngest digest. Expected "Directory structure:" and file delimiters (FILE:, ===, or ---).` }]
            };
          }

          // Parse GitIngest output
          const { parseOutput } = await import('../utils/gitingest-adapter.js');
          const { decomposeStructured, extractFilePaths } = await import('../utils/structured-decomposer.js');
          const metadata = parseOutput(content);
          
          // Track truncation (already applied by loadContextFromFile)
          const originalLength = content.length;
          const truncated = originalLength > CHARACTER_LIMIT;
          
          // Auto-decompose with intelligent defaults
          const filePaths = extractFilePaths(metadata.directoryTree);
          const chunks = decomposeStructured(
            content,
            {
              directoryTree: metadata.directoryTree,
              filePaths,
              sourceType: 'mixed'
            },
            {
              autoDetect: true,
              maxChunkSize: 10000,
              overlap: 200
            }
          );

          // Store chunks in session variables for later retrieval via rlm_get_chunks
          sessionManager.setVariable(
            session.id,
            `${params.context_id}_chunks`,
            chunks
          );
          console.log(`Stored ${chunks.length} chunks in session variables`);

          // Build file distribution summary (no chunk content to avoid context pollution)
          const fileDistribution: Record<string, number> = {};
          for (const chunk of chunks) {
            const files = (chunk.metadata?.files as string[]) || [];
            for (const file of files) {
              fileDistribution[file] = (fileDistribution[file] || 0) + 1;
            }
          }

          const output = {
            success: true,
            context_id: params.context_id,
            session_id: session.id,
            file_path: params.file_path,
            filetype: params.filetype,
            metadata: {
              source: params.file_path,
              fileCount: metadata.fileCount,
              estimatedTokens: metadata.estimatedTokens,
              directoryTree: metadata.directoryTree,
              originalLength,
              truncated,
              contentLength: content.length,
              chunkCount: chunks.length,
              strategy: 'auto'
            },
            // Return distribution summary instead of chunk samples
            chunk_summary: {
              total: chunks.length,
              file_distribution: fileDistribution,
              message: `Chunks distributed across ${Object.keys(fileDistribution).length} files. Use rlm_get_chunks to retrieve specific chunks by index.`
            }
          };

          // Check if output exceeds CHARACTER_LIMIT
          let text = JSON.stringify(output, null, 2);
          if (text.length > CHARACTER_LIMIT) {
            // Remove file distribution to reduce size (could be large with many files)
            output.chunk_summary.file_distribution = {};
            output.chunk_summary.message = `File distribution omitted to avoid context pollution. Use rlm_get_chunks to retrieve specific chunks.`;
            text = JSON.stringify(output, null, 2);
          }

          return {
            content: [{ type: 'text', text }],
            structuredContent: output
          };
        }

        // Default behavior: return basic metadata
        const output = {
          success: true,
          context_id: params.context_id,
          session_id: session.id,
          file_path: params.file_path,
          metadata: contextItem.metadata
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error: ${errorMessage}` }]
        };
      }
    }
  );

  server.registerTool(
    'rlm_get_context_info',
    {
      title: 'Get Context Info',
      description: `Get metadata and preview of a loaded context.

Returns:
- Length, line count, word count
- Detected structure type (json, csv, markdown, code, etc.)
- Optional content preview

Use this to understand the context before deciding how to process it.`,
      inputSchema: GetContextInfoInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: GetContextInfoInput) => {
      const session = params.session_id
        ? sessionManager.getSession(params.session_id)
        : sessionManager.getDefaultSession();

      const context = session?.contexts.get(params.context_id);
      
      if (!context) {
        return {
          content: [{ type: 'text', text: `Error: Context "${params.context_id}" not found` }]
        };
      }

      const output: Record<string, unknown> = {
        context_id: params.context_id,
        metadata: context.metadata,
        created_at: context.createdAt.toISOString()
      };

      if (params.include_preview) {
        output.preview = context.content.slice(0, params.preview_length);
        if (context.content.length > params.preview_length) {
          output.preview_truncated = true;
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'rlm_read_context',
    {
      title: 'Read Context Portion',
      description: `Read a specific portion of the context.

Modes:
- chars: Read by character offsets (start, end)
- lines: Read by line numbers (start, end)

Use this to examine specific sections without loading the entire context.`,
      inputSchema: ReadContextInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: ReadContextInput) => {
      const session = params.session_id
        ? sessionManager.getSession(params.session_id)
        : sessionManager.getDefaultSession();

      const context = session?.contexts.get(params.context_id);
      
      if (!context) {
        return {
          content: [{ type: 'text', text: `Error: Context "${params.context_id}" not found` }]
        };
      }

      let content: string;
      
      if (params.mode === 'lines') {
        content = contextProcessor.extractLines(
          context.content,
          params.start,
          params.end
        );
      } else {
        content = contextProcessor.extractRange(
          context.content,
          params.start,
          params.end || context.content.length
        );
      }

      const output = {
        content,
        start: params.start,
        end: params.end,
        mode: params.mode,
        length: content.length
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // ============================================
  // Decomposition Tools
  // ============================================

  server.registerTool(
    'rlm_decompose_context',
    {
      title: 'Decompose Context',
      description: `Split context into chunks using various strategies.

Strategies:
- fixed_size: Fixed character chunks with overlap
- by_lines: Chunk by number of lines
- by_paragraphs: Split on double newlines
- by_sections: Split on markdown headers
- by_regex: Split on custom pattern
- by_sentences: Split into sentences

Returns chunk metadata (indices, offsets). Use rlm_get_chunks to retrieve content.`,
      inputSchema: DecomposeContextInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: DecomposeContextInput) => {
      const session = params.session_id
        ? sessionManager.getSession(params.session_id)
        : sessionManager.getDefaultSession();

      const context = session?.contexts.get(params.context_id);
      
      if (!context) {
        return {
          content: [{ type: 'text', text: `Error: Context "${params.context_id}" not found` }]
        };
      }

      const chunks = contextProcessor.decompose(context.content, params.strategy, {
        chunkSize: params.chunk_size,
        overlap: params.overlap,
        linesPerChunk: params.lines_per_chunk,
        pattern: params.pattern
      });

      // Build output
      const output: Record<string, unknown> = {
        total_chunks: chunks.length,
        strategy: params.strategy,
        chunks: chunks.map(c => ({
          index: c.index,
          start_offset: c.startOffset,
          end_offset: c.endOffset,
          length: c.content.length,
          ...(c.metadata || {}),
          ...(params.return_content ? { content: c.content } : {})
        }))
      };

      // Truncate if too large
      let text = JSON.stringify(output, null, 2);
      if (text.length > CHARACTER_LIMIT) {
        // Return summary only
        output.chunks = chunks.slice(0, 10).map(c => ({
          index: c.index,
          start_offset: c.startOffset,
          end_offset: c.endOffset,
          length: c.content.length
        }));
        output.truncated = true;
        output.message = `Showing first 10 of ${chunks.length} chunks. Use rlm_get_chunks to retrieve specific chunks.`;
        text = JSON.stringify(output, null, 2);
      }

      return {
        content: [{ type: 'text', text }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'rlm_get_chunks',
    {
      title: 'Get Specific Chunks',
      description: `Retrieve content of specific chunks by index.

Use after rlm_decompose_context to get the actual content of chunks you want to process.
You can request multiple chunks at once (up to 50).`,
      inputSchema: GetChunksInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: GetChunksInput) => {
      const session = params.session_id
        ? sessionManager.getSession(params.session_id)
        : sessionManager.getDefaultSession();

      const context = session?.contexts.get(params.context_id);
      
      if (!context) {
        return {
          content: [{ type: 'text', text: `Error: Context "${params.context_id}" not found` }]
        };
      }

      // Check for pre-computed chunks from GitIngest
      const storedChunks = sessionManager.getVariable(session!.id, `${params.context_id}_chunks`) as any[] | undefined;

      if (storedChunks && storedChunks.length > 0) {
        // Return stored chunks directly (no re-decomposition)
        const chunks = params.chunk_indices
          .filter(i => i >= 0 && i < storedChunks.length)
          .map(i => ({
            index: i,
            content: storedChunks[i].content,
            start_offset: storedChunks[i].startOffset,
            end_offset: storedChunks[i].endOffset,
            metadata: storedChunks[i].metadata // Preserve file metadata!
          }));

        const output = {
          requested: params.chunk_indices.length,
          returned: chunks.length,
          chunks,
          source: 'stored' // Indicate chunks came from storage
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      }

      // FALLBACK: Re-decompose if no stored chunks exist
      const allChunks = contextProcessor.decompose(context.content, params.strategy, {
        chunkSize: params.chunk_size,
        overlap: params.overlap
      });

      // Get requested chunks
      const chunks = params.chunk_indices
        .filter(i => i >= 0 && i < allChunks.length)
        .map(i => ({
          index: i,
          content: allChunks[i].content,
          start_offset: allChunks[i].startOffset,
          end_offset: allChunks[i].endOffset
        }));

      const output = {
        requested: params.chunk_indices.length,
        returned: chunks.length,
        chunks
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // ============================================
  // Search Tools
  // ============================================

  server.registerTool(
    'rlm_search_context',
    {
      title: 'Search Context',
      description: `Search context using regex patterns.

Returns matches with surrounding context and line numbers.
Use this to find relevant sections before reading in detail.

Examples:
- Pattern: "error|warning" - Find all errors and warnings
- Pattern: "function\\s+\\w+" - Find function definitions
- Pattern: "TODO|FIXME" - Find code comments`,
      inputSchema: SearchContextInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: SearchContextInput) => {
      const session = params.session_id
        ? sessionManager.getSession(params.session_id)
        : sessionManager.getDefaultSession();

      const context = session?.contexts.get(params.context_id);
      
      if (!context) {
        return {
          content: [{ type: 'text', text: `Error: Context "${params.context_id}" not found` }]
        };
      }

      try {
        const matches = contextProcessor.search(context.content, params.pattern, {
          flags: params.flags,
          contextChars: params.context_chars,
          maxResults: params.max_results,
          includeLineNumbers: params.include_line_numbers,
          scope: params.search_scope
        });

        const output = {
          pattern: params.pattern,
          total_matches: matches.length,
          matches
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: Invalid regex pattern - ${error}` }]
        };
      }
    }
  );

  server.registerTool(
    'rlm_find_all',
    {
      title: 'Find All Occurrences',
      description: `Find all occurrences of a substring (faster than regex for simple searches).

Returns character offsets of all matches.`,
      inputSchema: FindAllInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: FindAllInput) => {
      const session = params.session_id
        ? sessionManager.getSession(params.session_id)
        : sessionManager.getDefaultSession();

      const context = session?.contexts.get(params.context_id);
      
      if (!context) {
        return {
          content: [{ type: 'text', text: `Error: Context "${params.context_id}" not found` }]
        };
      }

      const indices = contextProcessor.findAll(
        context.content,
        params.substring,
        params.case_sensitive
      );

      const output = {
        substring: params.substring,
        case_sensitive: params.case_sensitive,
        count: indices.length,
        offsets: indices
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // ============================================
  // REPL / Code Execution Tools
  // ============================================

  server.registerTool(
    'rlm_execute_code',
    {
      title: 'Execute Code',
      description: `Execute JavaScript code in the session's REPL environment.

Available functions:
- print(...args) - Output text
- getContext(id) - Get context content
- getContextMetadata(id) - Get context metadata
- len(str), slice(str,s,e), split(str,sep), join(arr,sep)
- search(pattern,text,flags), findAll(pattern,text), replace(text,pattern,repl)
- range(start,end,step), map(arr,fn), filter(arr,fn), reduce(arr,fn,init)
- setVar(name,value), getVar(name), listVars()
- setAnswer(content,ready), getAnswer()
- JSON.parse(), JSON.stringify()

Use this for custom data manipulation and aggregation.`,
      inputSchema: ExecuteCodeInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: ExecuteCodeInput) => {
      const sessionId = params.session_id || 'default';
      const result = await sessionManager.executeCode(sessionId, params.code);

      const output = {
        success: !result.error,
        output: result.output,
        error: result.error,
        duration_ms: result.durationMs
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'rlm_set_variable',
    {
      title: 'Set Variable',
      description: `Store a variable in the session for later use.

Use this to save intermediate results during RLM processing.`,
      inputSchema: SetVariableInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: SetVariableInput) => {
      const sessionId = params.session_id || 'default';
      sessionManager.setVariable(sessionId, params.name, params.value);

      return {
        content: [{ type: 'text', text: `Variable "${params.name}" set successfully` }],
        structuredContent: { success: true, name: params.name }
      };
    }
  );

  server.registerTool(
    'rlm_get_variable',
    {
      title: 'Get Variable',
      description: `Retrieve a variable from the session.`,
      inputSchema: GetVariableInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: GetVariableInput) => {
      const sessionId = params.session_id || 'default';
      const value = sessionManager.getVariable(sessionId, params.name);

      if (value === undefined) {
        return {
          content: [{ type: 'text', text: `Variable "${params.name}" not found` }]
        };
      }

      const output = {
        name: params.name,
        value
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // ============================================
  // Answer Management Tools
  // ============================================

  server.registerTool(
    'rlm_set_answer',
    {
      title: 'Set Answer',
      description: `Set or update the answer for the current RLM task.

Call this to build up your answer incrementally:
- ready=false: Store partial/intermediate answer
- ready=true: Mark answer as complete/final

The answer can be retrieved later with rlm_get_answer.`,
      inputSchema: SetAnswerInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: SetAnswerInput) => {
      const sessionId = params.session_id || 'default';
      sessionManager.setVariable(sessionId, 'answer', {
        content: params.content,
        ready: params.ready
      });

      const output = {
        success: true,
        ready: params.ready,
        content_length: params.content.length
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'rlm_get_answer',
    {
      title: 'Get Answer',
      description: `Get the current answer state.

Returns the content and whether it's marked as ready/complete.`,
      inputSchema: GetAnswerInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: GetAnswerInput) => {
      const sessionId = params.session_id || 'default';
      const answer = sessionManager.getVariable(sessionId, 'answer') as 
        { content: string; ready: boolean } | undefined;

      const output = answer || { content: '', ready: false };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // ============================================
  // Session Management Tools
  // ============================================

  server.registerTool(
    'rlm_create_session',
    {
      title: 'Create Session',
      description: `Create a new isolated RLM session.

Use this when you need multiple independent processing contexts.
Most use cases can use the default session.`,
      inputSchema: CreateSessionInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (_params: CreateSessionInput) => {
      const session = sessionManager.createSession();

      const output = {
        session_id: session.id,
        created_at: session.createdAt.toISOString()
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'rlm_get_session_info',
    {
      title: 'Get Session Info',
      description: `Get information about a session including loaded contexts and variables.`,
      inputSchema: GetSessionInfoInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: GetSessionInfoInput) => {
      const session = params.session_id
        ? sessionManager.getSession(params.session_id)
        : sessionManager.getDefaultSession();

      if (!session) {
        return {
          content: [{ type: 'text', text: 'Error: Session not found' }]
        };
      }

      const output = {
        session_id: session.id,
        created_at: session.createdAt.toISOString(),
        last_activity: session.lastActivityAt.toISOString(),
        contexts: Array.from(session.contexts.entries()).map(([id, ctx]) => ({
          id,
          length: ctx.metadata.length,
          structure: ctx.metadata.structure
        })),
        variables: Array.from(session.variables.keys()),
        execution_count: session.executionHistory.length
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'rlm_clear_session',
    {
      title: 'Clear Session',
      description: `Clear all data from a session (contexts, variables, history).`,
      inputSchema: ClearSessionInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: ClearSessionInput) => {
      const sessionId = params.session_id || 'default';
      sessionManager.clearSession(sessionId);

      return {
        content: [{ type: 'text', text: `Session "${sessionId}" cleared` }],
        structuredContent: { success: true, session_id: sessionId }
      };
    }
  );

  // ============================================
  // Utility Tools
  // ============================================

  server.registerTool(
    'rlm_suggest_strategy',
    {
      title: 'Suggest Decomposition Strategy',
      description: `Get a suggested decomposition strategy based on the context's structure.

Analyzes the content type and size to recommend the best chunking approach.`,
      inputSchema: SuggestStrategyInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: SuggestStrategyInput) => {
      const session = params.session_id
        ? sessionManager.getSession(params.session_id)
        : sessionManager.getDefaultSession();

      const context = session?.contexts.get(params.context_id);
      
      if (!context) {
        return {
          content: [{ type: 'text', text: `Error: Context "${params.context_id}" not found` }]
        };
      }

      const suggestion = contextProcessor.suggestStrategy(
        context.content,
        context.metadata.structure
      );

      const output = {
        context_id: params.context_id,
        structure: context.metadata.structure,
        ...suggestion
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'rlm_get_statistics',
    {
      title: 'Get Context Statistics',
      description: `Get detailed statistics about a context.

Returns length, line/word/sentence/paragraph counts, and averages.`,
      inputSchema: GetStatisticsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: GetStatisticsInput) => {
      const session = params.session_id
        ? sessionManager.getSession(params.session_id)
        : sessionManager.getDefaultSession();

      const context = session?.contexts.get(params.context_id);
      
      if (!context) {
        return {
          content: [{ type: 'text', text: `Error: Context "${params.context_id}" not found` }]
        };
      }

      const stats = contextProcessor.getStatistics(context.content);

      const output = {
        context_id: params.context_id,
        ...stats
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );


  // ============================================
  // GitIngest Tool
  // ============================================

  server.registerTool(
    'rlm_get_gitingest',
    {
      title: 'Get GitHub Repository Content via GitIngest',
      description: `Load any GitHub repository content using GitIngest (Python CLI). Returns structured repository summary, directory tree, and file contents.

GitIngest is a Python CLI tool that analyzes GitHub repositories and outputs a comprehensive summary including:
- Repository metadata and statistics
- Directory structure tree
- File contents (with optional filtering)

Security: This tool only accepts GitHub URLs (https://github.com/...). Local paths are rejected to maintain server‑agent security boundary.
For local repository analysis, run GitIngest client‑side and use \`rlm_load_context\` to load the output.

Example workflow:
1. rlm_get_gitingest - Analyze GitHub repository and load content
2. rlm_get_context_info - Understand structure and size
3. rlm_search_context - Find relevant code sections
4. rlm_read_context - Read specific files or portions

The tool uses GitIngest (pipx install gitingest) to fetch repository content.`,
      inputSchema: GetGitIngestInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetGitIngestInput) => {
      try {
        // Get session
        const session = params.session_id
          ? sessionManager.getSession(params.session_id)
          : sessionManager.getDefaultSession();
        
        if (!session) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Session not found'
              }, null, 2)
            }]
          };
        }

        // Call GitIngest with auto-decomposition enabled
        const result = await runGitIngest(params.url, {
          includePatterns: params.include_patterns,
          excludePatterns: params.exclude_patterns,
          maxFileSize: params.max_file_size,
          decomposition: { autoDecompose: true }
        });

        if (!result.success) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: result.error
              }, null, 2)
            }]
          };
        }

        // Load content into session
        const contextItem = sessionManager.loadContext(
          session.id,
          params.context_id,
          result.content
        );

        // If chunks were generated, store them in session metadata
        if (result.chunks && result.chunks.length > 0) {
          // Store chunk metadata in session variables for later retrieval
          sessionManager.setVariable(
            session.id,
            `${params.context_id}_chunks`,
            result.chunks
          );
          console.log(`Stored ${result.chunks.length} chunks in session variables`);
        }

        const output = {
          success: true,
          context_id: params.context_id,
          session_id: session.id,
          metadata: {
            source: result.metadata.source,
            file_count: result.metadata.fileCount,
            estimated_tokens: result.metadata.estimatedTokens,
            directory_tree: result.metadata.directoryTree,
            content_length: result.content.length,
            original_length: result.metadata.originalLength || result.content.length,
            truncated: result.metadata.truncated || false,
            strategy: 'auto',
            chunk_count: result.chunks?.length || 0,
            auto_decompose: true
          }
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Failed to get GitHub repository content: ${errorMessage}`
            }, null, 2)
          }]
        };
      }
    }
  );
}
