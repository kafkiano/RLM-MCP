# GitHub Documentation Workflow for RLM MCP Server

## 1. `gh-docs-download` (External Tool)
Downloads documentation from GitHub repositories using sparse checkout.

```bash
# Download documentation
gh-docs-download --repo "https://github.com/owner/repo/tree/main/docs" --output ./tmp/repo-docs
```

## 2. `toc-generator.ts` (TypeScript)
Generates essential Table of Contents without external dependencies or bloat.

```typescript
// Generate essential TOC
node scripts/toc-generator.ts --dir ./tmp/repo-docs --output ./tmp/repo-docs/repo-docs-toc.md --name "Repo Docs Documentation"
```

**Features:**
- Extracts titles from markdown headers
- **Essential structure only** (no preview bloat)
- Creates human-readable directory structure
- Configurable file extensions and exclusions
- **Outputs to README.md as single source of truth**

### 3. `ingest-docs.ts` (TypeScript)

TODO: Needs to be created


## Complete Workflow Example

An complete workflow example using the `mem0ai` repo:

### Step 1: Download Documentation

```bash
# Download mem0 documentation (349 files, ~2MB)
gh-docs-download --repo "https://github.com/mem0ai/mem0/tree/main/docs" --output ./tmp/mem0
```

### Step 2: Generate Essential Table of Contents

```bash
# Generate TOC (1386 Lines)
node scripts/toc-generator.ts \
  --dir ./tmp/mem0 \
  --output ./tmp/mem0/mem0-toc.md \
  --name "mem0 Documentation"
```

**Output:** `tmp/mem0/mem0-toc.md` with:
- File count and size summary
- Directory structure
- RLM loading instructions

### Step 3: Ingest into RLM

THIS WORKFLOW WE CREATE NOW...