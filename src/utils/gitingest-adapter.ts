/**
 * GitIngest Adapter
 *
 * Executes GitIngest CLI to analyze any GitHub repository and returns structured content.
 * GitIngest is a Python CLI tool that outputs repository summary, directory tree, and file contents.
 *
 * Security: This adapter only accepts GitHub URLs (https://github.com/...) and rejects local paths.
 */

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CHARACTER_LIMIT, DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP } from '../constants.js';
import { decomposeStructured, extractFilePaths } from './structured-decomposer.js';
import { DecompositionStrategy, Chunk } from '../types.js';

const execAsync = promisify(exec);

export interface GitIngestResult {
  success: boolean;
  content: string;
  metadata: {
    source: string;
    fileCount: number;
    estimatedTokens: number;
    directoryTree: string;
    originalLength?: number;
    truncated?: boolean;
  };
  chunks?: Chunk[];
  error?: string;
}

/**
 * Validate that URL is a GitHub repository URL (not local path)
 */
export function validateGitHubUrl(url: string): boolean {
  // Must start with https://github.com/
  if (!url.startsWith('https://github.com/')) {
    return false;
  }
  // Reject local paths, file://, etc.
  if (url.includes('./') || url.includes('../') || url.startsWith('file://')) {
    return false;
  }
  // Basic URL pattern
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'github.com';
  } catch {
    return false;
  }
}

/**
 * Check if gitingest CLI is available in PATH
 */
export async function checkGitIngestAvailable(): Promise<boolean> {
  try {
    await execAsync('which gitingest');
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate that GitIngest output contains expected sections
 */
export function validateGitIngestOutput(output: string): boolean {
  if (!output || output.trim().length === 0) {
    return false;
  }
  
  const hasDirectoryTree = output.includes('Directory structure:');
  const hasFileContent = output.includes('FILE:') || output.includes('===') || output.includes('---');
  
  return hasDirectoryTree && hasFileContent;
}

/**
 * Build CLI arguments array from options
 */
function buildArgs(
  url: string,
  options?: { includePatterns?: string[]; excludePatterns?: string[]; maxFileSize?: number }
): string[] {
  const args: string[] = [url, '-o', '-']; // Output to stdout

  if (options?.includePatterns && options.includePatterns.length > 0) {
    options.includePatterns.forEach(pattern => {
      args.push('-i', pattern);
    });
  }

  if (options?.excludePatterns && options.excludePatterns.length > 0) {
    options.excludePatterns.forEach(pattern => {
      args.push('-e', pattern);
    });
  }

  if (options?.maxFileSize) {
    args.push('-s', options.maxFileSize.toString());
  }

  return args;
}

/**
 * Parse GitIngest output into structured result
 * GitIngest outputs three sections: summary, directory tree, and file contents.
 * We'll capture the entire output as content and extract metadata where possible.
 */
function parseOutput(output: string): { fileCount: number; estimatedTokens: number; directoryTree: string } {
  // Default values
  let fileCount = 0;
  let estimatedTokens = 0;
  let directoryTree = '';

  // Try multiple regex patterns for file count extraction
  const fileCountMatch = output.match(/Files analyzed:\s*(\d+)/) ||
                        output.match(/Total files:\s*(\d+)/) ||
                        output.match(/(\d+)\s*files? processed/i);
  
  if (fileCountMatch) {
    fileCount = parseInt(fileCountMatch[1], 10);
  } else {
    // Fallback: count files in directory tree (match both ├── and └── patterns)
    const fileLines = output.match(/[├└]──\s+([^\n]+)/g) || [];
    fileCount = fileLines.length;
  }

  // Token estimation with multiple patterns
  const tokensMatch = output.match(/Estimated tokens:\s*([\d.,]+k?)/i) ||
                     output.match(/Tokens:\s*([\d.,]+k?)/i);
  
  if (tokensMatch) {
    const tokenStr = tokensMatch[1].replace(/,/g, '');
    if (tokenStr.endsWith('k')) {
      estimatedTokens = Math.round(parseFloat(tokenStr) * 1000);
    } else {
      estimatedTokens = parseInt(tokenStr, 10);
    }
  } else {
    // Fallback: approximate 0.75 tokens per character (rough LLM estimate)
    estimatedTokens = Math.round(output.length * 0.75);
  }

  // Extract directory tree (between "Directory structure:" and next blank line or file delimiter)
  const treeStart = output.indexOf('Directory structure:');
  if (treeStart !== -1) {
    const afterTree = output.substring(treeStart);
    const treeEnd = afterTree.indexOf('\n\n');
    if (treeEnd !== -1) {
      directoryTree = afterTree.substring(0, treeEnd);
    } else {
      directoryTree = afterTree;
    }
  }

  return { fileCount, estimatedTokens, directoryTree };
}

export interface GitIngestDecompositionOptions {
  autoDecompose: boolean; // Internal flag, always true
}

/**
 * Execute GitIngest CLI with given URL and options
 */
export async function runGitIngest(
  url: string,
  options?: {
    includePatterns?: string[];
    excludePatterns?: string[];
    maxFileSize?: number;
    decomposition?: GitIngestDecompositionOptions;
  }
): Promise<GitIngestResult> {
  // 1. Validate URL
  if (!validateGitHubUrl(url)) {
    return {
      success: false,
      content: '',
      metadata: { source: url, fileCount: 0, estimatedTokens: 0, directoryTree: '' },
      error: 'Invalid GitHub URL. Must be a public GitHub repository URL starting with https://github.com/. Local paths are not allowed for security.'
    };
  }

  // 2. Check if gitingest is installed
  const isAvailable = await checkGitIngestAvailable();
  if (!isAvailable) {
    return {
      success: false,
      content: '',
      metadata: { source: url, fileCount: 0, estimatedTokens: 0, directoryTree: '' },
      error: 'GitIngest CLI not found in PATH. Please install it first: pipx install gitingest (or pip install gitingest). See https://github.com/coderamp-labs/gitingest for installation instructions.'
    };
  }

  // 3. Build CLI arguments (only pass filtering options, not decomposition options)
  const args = buildArgs(url, {
    includePatterns: options?.includePatterns,
    excludePatterns: options?.excludePatterns,
    maxFileSize: options?.maxFileSize
  });

  // 4. Execute child process with timeout
  return new Promise((resolve) => {
    const timeoutMs = 300000; // 5 minutes for large repos
    console.log(`Running: gitingest ${args.join(' ')}`);

    const child = spawn('gitingest', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        success: false,
        content: '',
        metadata: { source: url, fileCount: 0, estimatedTokens: 0, directoryTree: '' },
        error: `GitIngest timed out after ${timeoutMs / 1000} seconds`
      });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code === 0) {
        // Validate output structure before parsing
        if (!validateGitIngestOutput(stdout)) {
          resolve({
            success: false,
            content: '',
            metadata: { source: url, fileCount: 0, estimatedTokens: 0, directoryTree: '' },
            error: 'GitIngest output appears malformed. Ensure gitingest CLI is up‑to‑date (pipx upgrade gitingest). The output should contain directory structure and file content sections.'
          });
          return;
        }
        
        const metadata = parseOutput(stdout);
        // Track truncation
        let content = stdout;
        const originalLength = content.length;
        let truncated = false;
        
        if (content.length > CHARACTER_LIMIT) {
          console.warn(`Warning: GitIngest output (${content.length} chars) exceeds CHARACTER_LIMIT (${CHARACTER_LIMIT}). Truncating.`);
          content = content.substring(0, CHARACTER_LIMIT);
          truncated = true;
        }
        
        // Always apply auto-decomposition with intelligent defaults
        const filePaths = extractFilePaths(metadata.directoryTree);
        const chunks = decomposeStructured(
          content,
          {
            directoryTree: metadata.directoryTree,
            filePaths,
            sourceType: 'mixed'
          },
          {
            autoDetect: true, // Use suggestStrategy() logic to auto-detect strategy
            maxChunkSize: DEFAULT_CHUNK_SIZE,
            overlap: DEFAULT_OVERLAP
          }
        );
        console.log(`Auto-decomposition produced ${chunks.length} chunks`);
        
        resolve({
          success: true,
          content,
          metadata: {
            source: url,
            fileCount: metadata.fileCount,
            estimatedTokens: metadata.estimatedTokens,
            directoryTree: metadata.directoryTree,
            originalLength,
            truncated
          },
          chunks,
          error: undefined
        });
      } else {
        resolve({
          success: false,
          content: '',
          metadata: { source: url, fileCount: 0, estimatedTokens: 0, directoryTree: '' },
          error: `GitIngest failed with exit code ${code}: ${stderr || 'Unknown error'}`
        });
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        content: '',
        metadata: { source: url, fileCount: 0, estimatedTokens: 0, directoryTree: '' },
        error: `Failed to spawn GitIngest: ${error.message}`
      });
    });
  });
}