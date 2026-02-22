# RLM MCP Server v2.0

[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-F472B6?style=flat&logo=bun&logoColor=white)](https://bun.sh)

**Recursive Language Model Infrastructure Server** - Enables ANY LLM to process arbitrarily long contexts through recursive decomposition.

## Architectural Context

The RLM MCP server sits between an LLM's limited context window and external data sources. It is **not** a persistent memory system, nor a database. It is a **processing buffer** that enables strategic information management before data enters the LLM's precious context space.

Read more about reasonable use cases in the [Memory Architecture Reference](docs/memory-architecture.md).

## 🎯 Key Design Principle

**No external LLM API required!** 

This server provides infrastructure only - your MCP client's LLM performs the reasoning. This means:
- ✅ Model and client agnostic (Claude, GPT, Llama, Gemini, local models, etc.)
- ✅ No API keys needed
- ✅ No additional costs
- ✅ Full control over the reasoning process
- ✅ Cross-platform (Windows, macOS, Linux)

```infographic
infographic compare-binary-horizontal-simple-fold
data
  title RLM Architecture Comparison
  items
    - label Traditional Approach
      desc Server calls external LLM API
      icon mdi:server-network
    - label This Server (v2.0)
      desc Client LLM does all reasoning
      icon mdi:brain
```

## How It Works

The RLM pattern treats long contexts as external data that the LLM interacts with programmatically:

```infographic
infographic sequence-steps-simple
data
  title RLM Processing Flow
  items
    - label 1. Load
      desc Load long context into server
    - label 2. Analyze
      desc Get structure and statistics
    - label 3. Decompose
      desc Split into manageable chunks
    - label 4. Process
      desc LLM reasons over chunks
    - label 5. Aggregate
      desc Combine into final answer
```

Your client's LLM uses the provided tools to:
1. **Load context** - Store arbitrarily long text
2. **Analyze** - Understand structure and size
3. **Decompose** - Split into chunks using various strategies
4. **Search** - Find relevant sections with regex
5. **Execute code** - Manipulate data with JavaScript
6. **Build answer** - Incrementally construct the response

## Installation

This project uses [Bun](https://bun.com/), so make sure you have it installed.

```shell
# Install bun globally
curl -fsSL https://bun.sh/install | bash
```

Build the server bin

```bash
# Install dependencies
bun install

# Build
bun run build:bin
```

LLMs can spawn new node instances by calling the RLM MCP Server via client mcp configuration. So there is no reason to start the server as a background process if you don't want to use shared sessions. 

If you want shared sessions for multiple agents run `bun start`.

```shell
# Run the server as daemon (If you need sharable multi agent sessions)
bun start
```

⚠️ The GitHub Repository Analysis Tool (`rlm_get_gitingest`) needs the **GitIngest** Python CLI tool installed:

```bash
# Install via pipx
pipx install gitingest
```

## MCP Client Configuration

#### Cline / Roo Code / Claude Desktop 

Edit `.roo/mcp.json` (or your client specific MCP configuration) and add:

```json
{
	"mcpServers": {
		"rlm": {
			"command": "bin/rlm-mcp-server",
			"alwaysAllow": [
				"rlm_load_context",
				"rlm_get_context_info",
				"rlm_read_context",
				"rlm_decompose_context",
				"rlm_find_all",
				"rlm_search_context",
				"rlm_get_chunks",
				"rlm_set_variable",
				"rlm_get_variable",
				"rlm_set_answer",
				"rlm_get_answer",
				"rlm_create_session",
				"rlm_get_statistics",
				"rlm_suggest_strategy",
				"rlm_clear_session",
				"rlm_get_session_info",
				"rlm_execute_code",
				"rlm_get_github_docs",
				"rlm_get_gitingest",
				"rlm_load_file"
			]
		}
	}
}
```

## Available Tools

### Context Management

| Tool | Description |
|------|-------------|
| `rlm_load_context` | Load text content into session |
| `rlm_get_context_info` | Get metadata and preview |
| `rlm_read_context` | Read portion by chars or lines |

### Decomposition

| Tool | Description |
|------|-------------|
| `rlm_decompose_context` | Split into chunks (multiple strategies) |
| `rlm_get_chunks` | Retrieve specific chunk contents |
| `rlm_suggest_strategy` | Get recommended chunking strategy |

### Search

| Tool | Description |
|------|-------------|
| `rlm_search_context` | Search with regex patterns |
| `rlm_find_all` | Find all substring occurrences |

### Code Execution

| Tool | Description |
|------|-------------|
| `rlm_execute_code` | Run JavaScript in REPL |
| `rlm_set_variable` | Store variable in session |
| `rlm_get_variable` | Retrieve variable |

### Answer Management

| Tool | Description |
|------|-------------|
| `rlm_set_answer` | Set/update answer (partial or final) |
| `rlm_get_answer` | Get current answer state |

### Session & Utilities

| Tool | Description |
|------|-------------|
| `rlm_create_session` | Create isolated session |
| `rlm_get_session_info` | Get session details |
| `rlm_clear_session` | Clear session data |
| `rlm_get_statistics` | Get detailed statistics |
| `rlm_get_gitingest` | Load any GitHub repository content using GitIngest (Python CLI) |

## Decomposition Strategies

| Strategy | Description | Best For |
|----------|-------------|----------|
| `fixed_size` | Fixed character chunks with overlap | General use, JSON |
| `by_lines` | Chunk by number of lines | Code, CSV, logs |
| `by_paragraphs` | Split on double newlines | Articles, documents |
| `by_sections` | Split on markdown headers | Markdown docs |
| `by_regex` | Split on custom pattern | Custom formats |
| `by_sentences` | Split into sentences | Dense text |

## REPL Environment Functions

When using `rlm_execute_code`:

```javascript
// Output
print(...args)                    // Print to output

// Context
getContext(id)                    // Get full content
getContextMetadata(id)            // Get metadata

// String Operations
len(str)                          // Length
slice(str, start, end)            // Substring
split(str, sep)                   // Split to array
join(arr, sep)                    // Join to string
trim(str), lower(str), upper(str) // String transforms

// Regex
search(pattern, text, flags)      // Find matches
findAll(pattern, text)            // All matches with index
replace(text, pattern, repl)      // Replace

// Array
range(start, end, step)           // Generate range
map(arr, fn)                      // Transform
filter(arr, fn)                   // Filter
reduce(arr, fn, init)             // Reduce
sort(arr, fn)                     // Sort (copy)
unique(arr)                       // Remove duplicates
chunk(arr, size)                  // Split array

// Variables
setVar(name, value)               // Store
getVar(name)                      // Retrieve
listVars()                        // List all

// Answer
setAnswer(content, ready)         // Set answer
getAnswer()                       // Get answer state

// JSON
JSON.parse(str)                   // Parse
JSON.stringify(obj, indent)       // Stringify
```

#### GitHub Repository Analysis with GitIngest

**Rationale**: Analyze any GitHub repository (including `/docs` directories) using the GitIngest Python CLI. The `rlm_get_gitingest` tool provides flexible repository analysis with file filtering, structured output including directory tree and file contents, and optional auto‑decomposition.

```javascript
// Analyze a GitHub repository with filtering and auto‑decomposition
rlm_get_gitingest({
  url: "https://github.com/owner/repo",
  context_id: "repo-analysis",
  include_patterns: ["*.py", "*.js", "*.md"],
  exclude_patterns: ["node_modules/*", "*.log"],
  max_file_size: 51200, // 50KB limit
  auto_decompose: true,  // Automatically decompose into chunks
  strategy: "by_sections", // Decomposition strategy
  chunk_size: 10000,     // Characters per chunk
  overlap: 200           // Overlap between chunks
})
```

**For documentation directories**: Use a subdirectory URL with `rlm_get_gitingest`:
```javascript
// Analyze only the /docs directory
rlm_get_gitingest({
  url: "https://github.com/owner/repo/tree/main/docs",
  context_id: "repo-docs",
  auto_decompose: true,
  strategy: "by_sections"
})
```

**Parameters**:
- `url` (required): GitHub repository URL (must start with `https://github.com/`). Can point to repository root or any subdirectory.
- `context_id` (optional, default: "gitingest"): Context identifier for loaded content
- `session_id` (optional): Session ID (default session if omitted)
- `include_patterns` (optional): Include files matching Unix shell-style wildcards
- `exclude_patterns` (optional): Exclude files matching Unix shell-style wildcards
- `max_file_size` (optional): Maximum file size in bytes to process
- `auto_decompose` (optional, default: false): Automatically decompose content into chunks
- `strategy` (optional): Decomposition strategy for chunking (when auto_decompose=true)
- `chunk_size` (optional, default: 10000): Chunk size in characters (for fixed_size strategy)
- `overlap` (optional, default: 200): Overlap between chunks
- `lines_per_chunk` (optional, default: 100): Lines per chunk (for by_lines strategy)
- `pattern` (optional): Regex pattern (for by_regex strategy)

**Security Note**: This tool only accepts GitHub URLs. Local paths are rejected to maintain server‑agent security boundary. For local repository analysis, run GitIngest client‑side and use `rlm_load_context` to load the output.

**Installation Requirement**: GitIngest must be installed separately: `pipx install gitingest` (or `pip install gitingest`).

## Example Workflow

Here's how an LLM might process a very long document:

```
1. Load the document:
   rlm_load_context(context="...", context_id="doc")

2. Analyze structure:
   rlm_get_context_info(context_id="doc")
   → Returns: 500,000 chars, markdown, 12,000 lines

3. Get strategy suggestion:
   rlm_suggest_strategy(context_id="doc")
   → Returns: by_sections (markdown content)

4. Decompose:
   rlm_decompose_context(context_id="doc", strategy="by_sections")
   → Returns: 45 chunks (sections)

5. Search for relevant sections:
   rlm_search_context(context_id="doc", pattern="climate change")
   → Returns: Matches in chunks 3, 7, 12, 23

6. Get those chunks:
   rlm_get_chunks(chunk_indices=[3, 7, 12, 23])
   → Returns: Content of those sections

7. Process each chunk (LLM reasoning)
   Build understanding from each section...

8. Save intermediate results:
   rlm_set_variable(name="findings", value=[...])

9. Aggregate into final answer:
   rlm_set_answer(content="Based on analysis...", ready=true)
```

The [Usage Examples Reference](docs/usage-examples.md) contains more practical examples.

## Use Cases

### Long Document Analysis
- Research paper summarization
- Legal document review
- Code repository understanding

### Multi-Document Processing
- Literature review
- Comparative analysis
- Information aggregation

### Log Analysis
- Error pattern detection
- Timeline reconstruction
- Anomaly identification

### Data Extraction
- Entity extraction from large texts
- Pattern mining
- Content classification

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     MCP Client                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │                Your LLM                          │   │
│  │  (Claude, GPT, Llama, Gemini, etc.)             │   │
│  │                                                  │   │
│  │  Performs all reasoning and recursive calls     │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                    MCP Protocol                         │
│                         │                               │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│              RLM MCP Server (this)                      │
│                         │                               │
│  ┌──────────────────────┴──────────────────────────┐   │
│  │              Tools Layer                         │   │
│  │  load, read, decompose, search, execute, etc.   │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│  ┌──────────────────────┴──────────────────────────┐   │
│  │            Services Layer                        │   │
│  │  ┌─────────────┐  ┌────────────────────────┐   │   │
│  │  │  Session    │  │  Context Processor     │   │   │
│  │  │  Manager    │  │  (decompose, search)   │   │   │
│  │  └─────────────┘  └────────────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  No external dependencies - pure JavaScript             │
└─────────────────────────────────────────────────────────┘
```

## Running Modes

The Server runs as daemon with `npm start` of isolated sessions there is no need to run the server as background service a simple tool call by an LLM agent client (Cline, Claude Code, Roo Code, etc.) trough configured mcp server settings is enough.

## Why This Design?

The original RLM paper describes a system where the LLM calls sub-LLMs recursively. However, in the MCP context:

1. **The client already has an LLM** - No need for another API
2. **Cost efficiency** - No additional API calls/costs
3. **Flexibility** - Works with any LLM
4. **Control** - The client controls the reasoning
5. **Simplicity** - Pure infrastructure, no API keys

The tools in this server provide everything needed for the LLM to implement RLM patterns itself.

## Contributing

Contributions welcome! Areas of interest:
- Additional decomposition strategies
- Performance optimizations
- New REPL helper functions
- Documentation improvements

## License

MIT License

## References

- [Recursive Language Models Paper](https://arxiv.org/abs/2512.24601)
- [RLM Blog Post](https://alexzhang13.github.io/blog/2025/rlm/)
- [MCP Protocol](https://modelcontextprotocol.io/)

---

Built for the long-context AI community 🚀
