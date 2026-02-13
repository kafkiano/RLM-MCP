/**
 * GitHub Documentation Downloader
 * 
 * Downloads documentation from GitHub repositories using gh-docs-download CLI tool.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export interface DownloadResult {
  outputDir: string;
  success: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
}

/**
 * Check if gh-docs-download is available in PATH
 */
export async function checkGhDocsDownloadAvailable(): Promise<boolean> {
  try {
    await execAsync('which gh-docs-download');
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse GitHub URL to extract components
 */
export function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
  branch: string;
  path: string;
} | null {
  // Pattern: https://github.com/owner/repo/tree/branch/path
  const pattern = /https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)(?:\/(.*))?/;
  const match = url.match(pattern);
  
  if (!match) {
    // Try without tree (maybe main branch)
    const simplePattern = /https:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)(?:\/(.*))?)?/;
    const simpleMatch = url.match(simplePattern);
    
    if (!simpleMatch) {
      return null;
    }
    
    const [, owner, repo, branch = 'main', path = ''] = simpleMatch;
    return { owner, repo, branch, path };
  }
  
  const [, owner, repo, branch, path = ''] = match;
  return { owner, repo, branch, path };
}

/**
 * Generate a temporary directory for download
 */
export function generateTempDir(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return path.join(os.tmpdir(), `rlm-github-${timestamp}-${random}`);
}

/**
 * Download GitHub documentation using gh-docs-download
 */
export async function downloadGitHubDocs(
  url: string,
  outputDir?: string
): Promise<DownloadResult> {
  const tempDir = outputDir || generateTempDir();
  
  // Ensure output directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Check if gh-docs-download is available
  const isAvailable = await checkGhDocsDownloadAvailable();
  if (!isAvailable) {
    return {
      outputDir: tempDir,
      success: false,
      error: 'gh-docs-download not found in PATH. Please install it first: npm install -g gh-docs-download'
    };
  }
  
  return new Promise((resolve) => {
    const args = ['--repo', url, '--output', tempDir];
    
    console.log(`Running: gh-docs-download ${args.join(' ')}`);
    
    const child = spawn('gh-docs-download', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          outputDir: tempDir,
          success: true,
          stdout,
          stderr
        });
      } else {
        resolve({
          outputDir: tempDir,
          success: false,
          error: `gh-docs-download failed with exit code ${code}`,
          stdout,
          stderr
        });
      }
    });
    
    child.on('error', (error) => {
      resolve({
        outputDir: tempDir,
        success: false,
        error: `Failed to spawn gh-docs-download: ${error.message}`,
        stdout,
        stderr
      });
    });
  });
}

/**
 * Clean up temporary directory
 */
export function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`Cleaned up temporary directory: ${dir}`);
    } catch (error) {
      console.warn(`Warning: Could not clean up directory ${dir}: ${error}`);
    }
  }
}