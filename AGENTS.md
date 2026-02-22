# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## RLM MCP Server

**Rationale**: Recursive Language Model (RLM) MCP Server - Infrastructure server to enable any LLM to process arbitrarily long contexts through recursive decomposition. All tools available through Client MCP Settings

- Project Name: RLM MCP Server - Recursive Language Model (RLM) MCP Server
- Tec Stack: Bun v1.3.9 | Express v4.21.0 | Typescript ES2022

## Agent‑Specific Guidelines

**WARNING – Interactive Commands**
- **DO NOT** run `bun run dev` or `bun run inspect` directly from an agent session.
- These commands start interactive Node.js processes that will **block/stall** your agent session.
- The server is designed to be run as an MCP background process configured in your client (Claude Desktop, Roo Code, Cline, Opencode, etc.). Follow your client specific instructions for MCP Server tool calling, however the tool names will always be the same as referenced below in this doc.

**Note about `bun start`:**
- `bun start` runs the HTTP server (`node dist/index.js --http --port=3000`) as background process.
- For single‑agent usage, configure your MCP client to launch the server via stdio (default).

**Correct Usage**
1. As an agent, you already have tool access via MCP – no need to start the server manually.
2. If you need a persistent shared session across multiple agents, run the HTTP server as a background process (`bun start`) and use explicit session IDs.

**Shared Sessions**
- By default each agent gets an isolated session (session_id='default').
- To share contexts between agents, start the HTTP server as a background process (`bun start`) and use explicit session IDs in tool calls.
- The singleton `SessionManager` automatically shares contexts, variables, and execution state across all agents using the same `session_id` parameter.
- HTTP mode supports concurrent access; stdio mode is limited to single‑agent usage.

## Coding Rules

**Rationale**: Keep the codebase clean, elegant, maintainable and predictable.

- Keep scripts under 300 lines.
- Use raw pipe‑able output (no colors/emojis).
- Fail early with clear error messages.
- Do not engage in over engineering and create only necessary functions.
- Git branching can be considered the norm so do not create any `.backup`files

## Testing Rules

**Rationale**: Ship working code not theoretical concepts.

### Compilation Testing
- Use `bun run build:bin` to test if Typescript build passes without errors.

### Integration Testing via RLM MCP Tools
**CRITICAL**: As an agent working in Claude Desktop, Roo Code, Cline, Opencode, etc. you have direct access to the RLM MCP server tools. Test your changes by calling the relevant tools to verify they work correctly in the live system.

**Testing Workflow**:
1. **After implementing tool changes**, call the tool directly using the MCP tool interface
2. **Verify response structure** matches expected schema and includes new features
3. **Test edge cases** with invalid inputs, large data, etc.
4. **Validate backward compatibility** by calling tools without new parameters

**Example Test Cases**:
- **Simplified API**: Call `rlm_get_gitingest` to verify chunks are auto-generated
- **Search scope**: Call `rlm_search_context` with `search_scope="content"` to verify directory tree is excluded
- **Error handling**: Test invalid inputs produce appropriate error messages
- **Performance**: Verify large repository processing completes within timeout

**Concrete Example**:
```javascript
// Test the simplified API with auto-decomposition
rlm_get_gitingest({
  url: "https://github.com/coderamp-labs/gitingest",
  include_patterns: ["*.ts", "*.md"]
})
// Expected: success=true, chunk_count > 0, auto_decompose=true in metadata
```

### Manual Testing Commands
- **DO NOT** run `bun run dev` or `bun run inspect` (these block the agent session)
- **Optional**: Run `bun start` for HTTP mode testing if you need shared sessions
- **Prefer**: Direct MCP tool calls through the client interface

## Available Tools

**Rationale**: As an LLM agent working with Claude Desktop, Roo Code, Cline, Opencode, etc. (You are if you read this!), the following tools are natively provided by your client mcp settings.

Context Management

| Tool | Description | When to Use |
|------|-------------|--------------|
| `rlm_load_context` | Load content already in LLM context into ephemeral storage (any size). | Use when you need to preserve content already in your LLM context for later processing. |
| `rlm_load_file` | Load files from disk (any size). Prevents context pollution by reading files server-side. | Use for loading files from disk without reading them into LLM context first. Always prefer this tool over `rlm_load_context` for file loading. |
| `rlm_get_context_info` | Get metadata and preview | Understand structure and size before processing |
| `rlm_read_context` | Read portion by chars or lines | Examine specific sections without loading entire context |

**Note**: Choose `rlm_load_file` when possible to keep large data out of LLM context.

#### Decomposition

| Tool | Description |
|------|-------------|
| `rlm_decompose_context` | Split into chunks (multiple strategies) |
| `rlm_get_chunks` | Retrieve specific chunk contents |
| `rlm_suggest_strategy` | Get recommended chunking strategy |

#### Search

| Tool | Description |
|------|-------------|
| `rlm_search_context` | Search with regex patterns |
| `rlm_find_all` | Find all substring occurrences |

#### Code Execution

| Tool | Description |
|------|-------------|
| `rlm_execute_code` | Run JavaScript in REPL |
| `rlm_set_variable` | Store variable in session |
| `rlm_get_variable` | Retrieve variable |

#### Answer Management

| Tool | Description |
|------|-------------|
| `rlm_set_answer` | Set/update answer (partial or final) |
| `rlm_get_answer` | Get current answer state |

#### Session & Utilities

| Tool | Description |
|------|-------------|
| `rlm_create_session` | Create isolated session |
| `rlm_get_session_info` | Get session details |
| `rlm_clear_session` | Clear session data |
| `rlm_get_statistics` | Get detailed statistics |
| `rlm_get_gitingest` | Load any GitHub repository content using GitIngest (Python CLI). GitHub URLs only; for local analysis run GitIngest client‑side and use `rlm_load_file` with `filetype='gitingest'`. |

#### Decomposition Strategies

| Strategy | Description | Best For |
|----------|-------------|----------|
| `fixed_size` | Fixed character chunks with overlap | General use, JSON |
| `by_lines` | Chunk by number of lines | Code, CSV, logs |
| `by_paragraphs` | Split on double newlines | Articles, documents |
| `by_sections` | Split on markdown headers | Markdown docs |
| `by_regex` | Split on custom pattern | Custom formats |
| `by_sentences` | Split into sentences | Dense text |

#### REPL Environment Functions

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

#### Check detailed Usage Examples for RLM MCP Server

**Rationale**: Load huge files without context pollution and make them searchable (In this case with the  detailed RLM MCP usage examples).

```javascript
rlm_load_file({file_path: "docs/usage-examples.md"})
rlm_suggest_strategy({context_id: "docs"}) // → Returns "by_sections"
rlm_decompose_context({context_id: "docs", strategy: "by_sections"})
rlm_search_context({context_id: "docs", pattern: "Example 5"})
```

#### Remote GitHub Repository Analysis for RLM MCP Server

**Rationale**: Analyze any GitHub repository (including `/docs` directories) using the GitIngest Python CLI. The `rlm_get_gitingest` tool provides flexible repository analysis with file filtering, structured output, and automatic decomposition with intelligent defaults.

```javascript
// Analyze a GitHub repository (auto-decomposition is always enabled)
rlm_get_gitingest({
  url: "https://github.com/owner/repo",
  context_id: "repo-analysis",
  include_patterns: ["*.py", "*.js", "*.md"],
  exclude_patterns: ["node_modules/*", "*.log"],
  max_file_size: 51200 // 50KB limit
})
```

**Rationale**: Most open source projects have their documentations and technical references in `/docs` directory or separate repo. The `rlm_get_gitingest` is therefore ideal for reading online docs.

**For documentation directories**: Use a subdirectory URL with `rlm_get_gitingest`:
```javascript
// Analyze only the /docs directory
rlm_get_gitingest({
  url: "https://github.com/owner/repo/tree/main/docs",
  context_id: "repo-docs"
})
```

**Parameters**:
- `url` (required): GitHub repository URL (must start with `https://github.com/`). Can point to repository root or any subdirectory.
- `context_id` (optional, default: "gitingest"): Context identifier for loaded content
- `session_id` (optional): Session ID (default session if omitted)
- `include_patterns` (optional): Include files matching Unix shell-style wildcards
- `exclude_patterns` (optional): Exclude files matching Unix shell-style wildcards
- `max_file_size` (optional): Maximum file size in bytes to process

#### Local GitHub Repository Analysis for RLM MCP Server

**Rationale**: This approach is ideal when you want to analyze a local repository. The tool `rlm_get_gitingest` only accepts GitHub URLs, local paths are rejected to maintain server‑agent security boundary.

**Step 1: Generate repository digest locally**
```bash
# From your repository root
gitingest ./ -o tmp/digest.txt
```

The output (`tmp/digest.txt`) contains three structured sections:
1. **Repository summary** – metadata, file count, token estimation
2. **Directory structure** – hierarchical tree view
3. **File contents** – each file wrapped with clear delimiters

**Step 2: Load the digest with auto‑decomposition**
```javascript
rlm_load_file({
  "file_path": "tmp/digest.txt",
  "context_id": "repo-digest",
  "filetype": "gitingest"
})
```
**Note**: Using `rlm_load_file` with `filetype='gitingest'` automatically:
- Parses GitIngest output to extract metadata (file count, tokens, directory tree)
- Applies smart truncation if content exceeds CHARACTER_LIMIT
- Auto-decomposes content into searchable chunks using intelligent defaults
- Stores chunks server-side for later retrieval via `rlm_get_chunks`
- Returns only chunk metadata (not full chunk content) to prevent context pollution
- Reads the file directly on the server without requiring the LLM to read it first (prevents context pollution)

**Auto‑decomposition feature**: Content is automatically decomposed into searchable chunks using intelligent defaults (strategy auto-detected based on content type). This reduces LLM cognitive overhead by delivering pre‑processed content ready for `rlm_get_chunks`, `rlm_search_context` and `rlm_read_context` operations.

Use the provided tools to:
1. **Load context** - Store arbitrarily long text (use `rlm_load_file` for large files to avoid context pollution)
2. **Analyze** - Understand structure and size of large files
3. **Decompose** - Split into chunks using various strategies (auto-decomposed for GitIngest files)
4. **Search** - Find relevant sections with regex
5. **Execute code** - Manipulate data with JavaScript
6. **Build answer** - Incrementally construct the response

**Critical: Context Pollution Prevention**
- Use `rlm_load_file` with `file_path` parameter for large files (> 1000 characters)
- Use `rlm_load_context` with `context` parameter only for small snippets or already-loaded content
- The `filetype` parameter in `rlm_load_file` enables specialized processing (e.g., `filetype='gitingest'` for auto-decomposition)

**Security Note**: This tool only accepts GitHub URLs. Local paths are rejected to maintain server‑agent security boundary. For local repository analysis, run `gitingest ./ -o tmp/digest.txt` client‑side and use `rlm_load_file` with `filetype='gitingest'` to load the output with auto-decomposition (server-side file loading prevents context pollution).