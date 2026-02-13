#!/usr/bin/env node

/**
 * Documentation TOC Generator
 * 
 * Generates a Table of Contents for documentation repositories
 * without external dependencies like `tree` command.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Config {
  docsDir: string;
  outputFile: string;
  contextName: string;
  includeExtensions: string[];
  excludePatterns: string[];
  maxPreviewChars: number;
}

const DEFAULT_CONFIG: Config = {
  docsDir: './docs',
  outputFile: 'documentation_toc.md',
  contextName: 'docs',
  includeExtensions: ['.md', '.mdx', '.txt', '.rst', '.adoc', '.html'],
  excludePatterns: ['node_modules', '.git', 'dist', 'build'],
  maxPreviewChars: 150
};

interface FileInfo {
  relativePath: string;
  fullPath: string;
  title: string;
  preview: string;
  size: number;
  lines: number;
}

class TOCGenerator {
  private config: Config;
  private fileCount = 0;
  private totalSize = 0;

  constructor(config: Partial<Config> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate TOC from documentation directory
   */
  async generate(): Promise<string> {
    console.log(`📚 Generating TOC for: ${this.config.contextName}`);
    console.log(`📁 Source directory: ${this.config.docsDir}`);

    // Validate directory exists
    if (!fs.existsSync(this.config.docsDir)) {
      throw new Error(`Directory not found: ${this.config.docsDir}`);
    }

    // Collect all documentation files
    const files = this.collectFiles(this.config.docsDir);
    this.fileCount = files.length;

    // Generate TOC content
    const tocContent = this.buildTOC(files);

    // Write to file
    fs.writeFileSync(this.config.outputFile, tocContent, 'utf-8');

    console.log(`✅ TOC generated: ${this.config.outputFile}`);
    console.log(`   Files: ${this.fileCount}, Total size: ${this.formatSize(this.totalSize)}`);

    return tocContent;
  }

  /**
   * Recursively collect documentation files
   */
  private collectFiles(dir: string, baseDir = ''): FileInfo[] {
    const files: FileInfo[] = [];
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = baseDir ? path.join(baseDir, entry.name) : entry.name;

        // Skip excluded patterns
        if (this.config.excludePatterns.some(pattern => 
          entry.name.includes(pattern) || relativePath.includes(pattern)
        )) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively process subdirectory
          files.push(...this.collectFiles(fullPath, relativePath));
        } else if (this.isDocumentationFile(entry.name)) {
          // Process documentation file
          const fileInfo = this.processFile(fullPath, relativePath);
          if (fileInfo) {
            files.push(fileInfo);
            this.totalSize += fileInfo.size;
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️  Warning: Could not read directory ${dir}: ${error}`);
    }

    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  /**
   * Check if file is a documentation file based on extension
   */
  private isDocumentationFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return this.config.includeExtensions.includes(ext);
  }

  /**
   * Process a single file to extract metadata
   */
  private processFile(fullPath: string, relativePath: string): FileInfo | null {
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const stats = fs.statSync(fullPath);
      
      // Extract title (first markdown header or filename)
      let title = this.extractTitle(content, relativePath);
      
      // Generate preview (first non-empty, non-header lines)
      const preview = this.generatePreview(content);
      
      // Count lines
      const lines = content.split('\n').length;

      return {
        relativePath,
        fullPath,
        title,
        preview,
        size: stats.size,
        lines
      };
    } catch (error) {
      console.warn(`⚠️  Warning: Could not read file ${relativePath}: ${error}`);
      return null;
    }
  }

  /**
   * Extract title from file content
   */
  private extractTitle(content: string, relativePath: string): string {
    // Try to find first markdown header (# Title)
    const headerMatch = content.match(/^#\s+(.+)$/m);
    if (headerMatch) {
      return headerMatch[1].trim();
    }

    // Try to find first h1 in markdown
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }

    // Fallback to filename without extension
    const basename = path.basename(relativePath, path.extname(relativePath));
    return basename.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Generate preview text from file content
   */
  private generatePreview(content: string): string {
    // Get first 10 lines, filter out headers and empty lines
    const lines = content.split('\n').slice(0, 10);
    const meaningfulLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---');
    });

    if (meaningfulLines.length === 0) {
      return 'No preview available';
    }

    const preview = meaningfulLines.join(' ').trim();
    if (preview.length > this.config.maxPreviewChars) {
      return preview.substring(0, this.config.maxPreviewChars) + '...';
    }

    return preview;
  }

  /**
   * Build the complete TOC markdown content
   */
  private buildTOC(files: FileInfo[]): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Documentation Index: ${this.config.contextName}`);
    lines.push('');
    lines.push(`*Generated: ${new Date().toISOString()}*`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push(`- **Total Files:** ${this.fileCount}`);
    lines.push(`- **Total Size:** ${this.formatSize(this.totalSize)}`);
    lines.push(`- **Generated:** ${new Date().toLocaleString()}`);
    lines.push('');

    // Directory structure (simplified)
    lines.push('## Directory Structure');
    const dirTree = this.generateDirectoryTree(files);
    lines.push(dirTree);
    lines.push('');

    // File manifest
    lines.push('## File Manifest');
    lines.push('');
    
    for (const file of files) {
      lines.push(`### ${file.title}`);
      lines.push(`- **Path:** \`${file.relativePath}\``);
      lines.push(`- **Size:** ${this.formatSize(file.size)} (${file.lines} lines)`);
      lines.push(`- **Preview:** ${file.preview}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate a simple directory tree without external dependencies
   */
  private generateDirectoryTree(files: FileInfo[]): string {
    const treeLines: string[] = [];
    const dirs = new Set<string>();
    
    // Collect all directories
    for (const file of files) {
      const dir = path.dirname(file.relativePath);
      if (dir !== '.') {
        dirs.add(dir);
      }
    }

    // Sort directories
    const sortedDirs = Array.from(dirs).sort();

    // Build tree
    for (const dir of sortedDirs) {
      const indent = '  '.repeat(dir.split('/').length - 1);
      treeLines.push(`${indent}📁 ${path.basename(dir)}/`);
      
      // List files in this directory
      const dirFiles = files.filter(f => path.dirname(f.relativePath) === dir);
      for (const file of dirFiles) {
        const fileIndent = '  '.repeat(dir.split('/').length);
        const ext = path.extname(file.relativePath);
        const icon = ext === '.mdx' ? '📄' : '📝';
        treeLines.push(`${fileIndent}${icon} ${path.basename(file.relativePath)}`);
      }
    }

    // List root files
    const rootFiles = files.filter(f => path.dirname(f.relativePath) === '.');
    for (const file of rootFiles) {
      const ext = path.extname(file.relativePath);
      const icon = ext === '.mdx' ? '📄' : '📝';
      treeLines.push(`${icon} ${path.basename(file.relativePath)}`);
    }

    return treeLines.join('\n');
  }

  /**
   * Format file size in human-readable format
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  // Simple CLI argument parsing
  const config: Partial<Config> = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      config.docsDir = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      config.outputFile = args[++i];
    } else if (args[i] === '--name' && args[i + 1]) {
      config.contextName = args[++i];
    } else if (args[i] === '--help') {
      console.log(`
Usage: toc-generator [options]

Options:
  --dir <path>      Documentation directory (default: ./docs)
  --output <file>   Output TOC file (default: documentation_toc.md)
  --name <name>     Context name for TOC header (default: docs)
  --help            Show this help message

Examples:
  node toc-generator.ts --dir ./docs/mem0 --output mem0_toc.md --name "mem0-docs"
      `);
      process.exit(0);
    }
  }

  try {
    const generator = new TOCGenerator(config);
    await generator.generate();
  } catch (error) {
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { TOCGenerator, DEFAULT_CONFIG };
export type { Config, FileInfo };