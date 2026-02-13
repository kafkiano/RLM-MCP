/**
 * Documentation Aggregator
 * 
 * Aggregates documentation files and decomposes them using ContextProcessor.
 */

import fs from 'fs';
import path from 'path';
import { contextProcessor } from '../services/context-processor.js';
import { TOCGenerator, type FileInfo } from './toc-generator.js';
import { DecompositionStrategy, StructureType } from '../types.js';

export interface AggregationResult {
  aggregatedContent: string;
  chunks: Array<{
    index: number;
    content: string;
    startOffset: number;
    endOffset: number;
    metadata?: Record<string, unknown>;
  }>;
  fileCount: number;
  totalSize: number;
  chunkCount: number;
}

/**
 * Aggregate and decompose documentation files
 */
export async function aggregateAndDecompose(
  files: FileInfo[],
  strategy?: DecompositionStrategy
): Promise<AggregationResult> {
  if (files.length === 0) {
    throw new Error('No documentation files to aggregate');
  }

  // Build aggregated content with separators
  const aggregatedContent = buildAggregatedContent(files);
  
  // Auto-detect strategy if not provided
  const finalStrategy = strategy || detectStrategyFromFiles(files);
  
  // Decompose using ContextProcessor
  const chunks = contextProcessor.decompose(aggregatedContent, finalStrategy, {
    chunkSize: 10000,
    overlap: 200
  });

  // Calculate total size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return {
    aggregatedContent,
    chunks,
    fileCount: files.length,
    totalSize,
    chunkCount: chunks.length
  };
}

/**
 * Build aggregated content from files
 */
function buildAggregatedContent(files: FileInfo[]): string {
  const sections: string[] = [];
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file.fullPath, 'utf-8');
      
      // Add file header
      sections.push(`--- FILE: ${file.relativePath} ---`);
      sections.push(`Title: ${file.title}`);
      sections.push(`Size: ${file.size} bytes, Lines: ${file.lines}`);
      sections.push('');
      
      // Add content
      sections.push(content);
      
      // Add separator
      sections.push('');
      sections.push('='.repeat(80));
      sections.push('');
    } catch (error) {
      console.warn(`Warning: Could not read file ${file.relativePath}: ${error}`);
      sections.push(`--- FILE: ${file.relativePath} (ERROR: Could not read) ---`);
      sections.push('');
    }
  }
  
  return sections.join('\n');
}

/**
 * Detect appropriate decomposition strategy based on file types
 */
function detectStrategyFromFiles(files: FileInfo[]): DecompositionStrategy {
  // Check if files are mostly markdown
  const markdownCount = files.filter(f => 
    f.relativePath.toLowerCase().endsWith('.md') || 
    f.relativePath.toLowerCase().endsWith('.mdx')
  ).length;
  
  const markdownRatio = markdownCount / files.length;
  
  if (markdownRatio > 0.7) {
    // Mostly markdown - use sections
    return DecompositionStrategy.BY_SECTIONS;
  }
  
  // Check average file size
  const avgSize = files.reduce((sum, f) => sum + f.size, 0) / files.length;
  
  if (avgSize > 50000) {
    // Large files - use fixed size chunks
    return DecompositionStrategy.FIXED_SIZE;
  }
  
  // Default to paragraphs for mixed content
  return DecompositionStrategy.BY_PARAGRAPHS;
}

/**
 * Load documentation from directory and aggregate
 */
export async function loadAndAggregateDocs(
  docsDir: string,
  strategy?: DecompositionStrategy
): Promise<AggregationResult> {
  // Use TOCGenerator to get file list
  const generator = new TOCGenerator({
    docsDir,
    outputFile: '', // Not needed for file listing
    contextName: 'docs'
  });
  
  const files = await generator.getFiles();
  
  if (files.length === 0) {
    throw new Error(`No documentation files found in ${docsDir}`);
  }
  
  return aggregateAndDecompose(files, strategy);
}