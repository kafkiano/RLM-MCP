# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Coding Rules

**Rationale**: Keep the codebase clean, elegant, maintainable and predictable.

- Keep scripts under 300 lines.
- Use raw pipe‑able output (no colors/emojis).
- Fail early with clear error messages.
- Do not engage in over engineering and create only necessary functions.
- Git branching can be considered the norm so do not create any `.backup`files

## RLM MCP Server

**Rationale**: Recursive Language Model Infrastructure Server - Enables any LLM to process arbitrarily long contexts through recursive decomposition.

Use the provided tools to:
1. **Load context** - Store arbitrarily long text
2. **Analyze** - Understand structure and size
3. **Decompose** - Split into chunks using various strategies
4. **Search** - Find relevant sections with regex
5. **Execute code** - Manipulate data with JavaScript
6. **Build answer** - Incrementally construct the response

#### Available Tools

Context Management

| Tool | Description |
|------|-------------|
| `rlm_load_context` | Load text content into session |
| `rlm_get_context_info` | Get metadata and preview |
| `rlm_read_context` | Read portion by chars or lines |

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
| `rlm_get_github_docs` | Download GitHub documentation and load into session |

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

#### GitHub Documentation Workflow for RLM MCP Server

**Rationale**: Retrieve any github documentation recursive searchable and structured by simply using its url. Use the `rlm_get_github_docs` tool to download, aggregate, and load GitHub documentation in a single step:

```javascript
// Single tool call to prepare a github repo
rlm_get_github_docs({
  url: "https://github.com/owner/repo/tree/main/docs",
  context_id: "repo-docs",
  strategy: "by_sections" // Optional: auto-detected by default
})
```

**Parameters**:
- `url` (required): GitHub URL pointing to documentation directory
- `context_id` (optional, default: "github-docs"): Context identifier for loaded docs
- `session_id` (optional): Session ID (default session if omitted)
- `strategy` (optional): Override decomposition strategy (auto-detected by default)
- `keep_temp` (optional, default: false): Keep temporary downloaded files for debugging
