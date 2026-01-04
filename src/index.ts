/**
 * RLM MCP Server v2.0
 * Recursive Language Model Infrastructure Server
 * 
 * This server provides tools that enable ANY MCP client's LLM to implement
 * RLM (Recursive Language Model) patterns for processing arbitrarily long contexts.
 * 
 * Key Design Principle:
 * - No external LLM API dependencies
 * - The client's LLM performs the reasoning
 * - This server provides the infrastructure:
 *   - Context storage and management
 *   - Decomposition into chunks
 *   - Search and navigation
 *   - Code execution (REPL)
 *   - State management across turns
 * 
 * Based on the paper "Recursive Language Models" by Zhang, Kraska, and Khattab
 * https://arxiv.org/abs/2512.24601
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { SERVER_NAME, SERVER_VERSION } from './constants.js';
import { registerRLMTools } from './tools/rlm-tools.js';
import { sessionManager } from './services/session-manager.js';

/**
 * Create and configure the MCP server
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  // Register all RLM tools
  registerRLMTools(server);

  return server;
}

/**
 * Start server with stdio transport (default)
 */
async function startStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Running on stdio transport`);
}

/**
 * Start server with HTTP transport
 */
async function startHttpServer(port: number = 3000): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '100mb' })); // Allow large contexts

  // Create a new server instance for each request (stateless)
  app.post('/mcp', async (req, res) => {
    const server = createServer();
    
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });

    res.on('close', () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Health check endpoint
  app.get('/health', (_, res) => {
    res.json({
      status: 'ok',
      server: SERVER_NAME,
      version: SERVER_VERSION
    });
  });

  // Server info endpoint
  app.get('/info', (_, res) => {
    res.json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      description: 'RLM Infrastructure Server - Enables any LLM to process arbitrarily long contexts through recursive decomposition',
      design: 'No external LLM API required - your client LLM performs the reasoning',
      tools: [
        // Context Management
        'rlm_load_context',
        'rlm_get_context_info', 
        'rlm_read_context',
        // Decomposition
        'rlm_decompose_context',
        'rlm_get_chunks',
        // Search
        'rlm_search_context',
        'rlm_find_all',
        // Code Execution
        'rlm_execute_code',
        'rlm_set_variable',
        'rlm_get_variable',
        // Answer Management
        'rlm_set_answer',
        'rlm_get_answer',
        // Session Management
        'rlm_create_session',
        'rlm_get_session_info',
        'rlm_clear_session',
        // Utilities
        'rlm_suggest_strategy',
        'rlm_get_statistics'
      ]
    });
  });

  app.listen(port, () => {
    console.error(`[${SERVER_NAME}] HTTP server running on port ${port}`);
    console.error(`  - MCP endpoint: POST http://localhost:${port}/mcp`);
    console.error(`  - Health check: GET http://localhost:${port}/health`);
    console.error(`  - Server info: GET http://localhost:${port}/info`);
  });
}

/**
 * Print usage instructions
 */
function printUsage(): void {
  console.error(`
${SERVER_NAME} v${SERVER_VERSION}
RLM Infrastructure Server - Enables any LLM to process arbitrarily long contexts

USAGE:
  node dist/index.js [OPTIONS]

OPTIONS:
  --stdio          Run with stdio transport (default)
  --http           Run with HTTP transport
  --port=PORT      HTTP port (default: 3000)
  --help           Show this help message

EXAMPLES:
  node dist/index.js                    # Start with stdio
  node dist/index.js --http             # Start HTTP server on port 3000
  node dist/index.js --http --port=8080 # Start HTTP server on port 8080

MCP CLIENT CONFIG (Claude Desktop):
  {
    "mcpServers": {
      "rlm": {
        "command": "node",
        "args": ["path/to/rlm-mcp-server/dist/index.js"]
      }
    }
  }

No API keys required - this server provides infrastructure only.
Your client's LLM performs all the reasoning.
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const httpMode = args.includes('--http');
  const portArg = args.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : 3000;

  console.error(`[${SERVER_NAME}] v${SERVER_VERSION}`);
  console.error('RLM Infrastructure Server');
  console.error('Enables any LLM to process arbitrarily long contexts');
  console.error('');

  // Cleanup on exit
  process.on('SIGINT', () => {
    sessionManager.destroy();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    sessionManager.destroy();
    process.exit(0);
  });

  if (httpMode) {
    await startHttpServer(port);
  } else {
    await startStdioServer();
  }
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
