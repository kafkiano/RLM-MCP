/**
 * Structured Decomposer
 * 
 * Provides metadata-aware decomposition for structured content (repository analysis, documentation).
 * Supports directory tree parsing, file-boundary detection, and smart truncation with priority preservation.
 */

import { DecompositionStrategy, Chunk } from '../types.js';
import { contextProcessor } from '../services/context-processor.js';
import { CHARACTER_LIMIT } from '../constants.js';

export interface StructuredDecompositionOptions {
  strategy?: DecompositionStrategy;
  autoDetect?: boolean;
  preserveTree?: boolean;
  maxChunkSize?: number;
  overlap?: number;
  linesPerChunk?: number;
  pattern?: string;
}

export interface FileBoundary {
  path: string;
  startOffset: number;
  endOffset: number;
  priority: number; // 1=highest (directory tree, README), 2=medium (.md files), 3=low (source code), 4=lowest (other)
}

/**
 * Parse directory tree string into file paths and hierarchy
 * Example tree format:
 * Directory structure:
 * └── repo-name/
 *     ├── README.md
 *     ├── src/
 *     │   ├── index.js
 *     │   └── utils.js
 *     └── docs/
 *         └── guide.md
 */
export function parseDirectoryTree(tree: string): string[] {
  const filePaths: string[] = [];
  
  if (!tree || !tree.includes('Directory structure:')) {
    return filePaths;
  }

  const lines = tree.split('\n');
  let inTree = false;
  
  for (const line of lines) {
    // Skip header line
    if (line.includes('Directory structure:')) {
      inTree = true;
      continue;
    }
    
    if (!inTree || !line.trim()) {
      continue;
    }
    
    // Parse tree line to extract file path
    // Remove tree characters (└──, ├──, │, etc.) and trim
    const cleaned = line
      .replace(/^[│├└\s─]+/, '') // Remove tree characters
      .trim();
    
    if (cleaned && !cleaned.endsWith('/')) {
      // This is a file (not a directory)
      filePaths.push(cleaned);
    }
  }
  
  return filePaths;
}

/**
 * Detect file boundaries in content based on directory tree and known patterns
 */
export function detectFileBoundaries(
  content: string,
  directoryTree?: string,
  filePaths?: string[]
): FileBoundary[] {
  const boundaries: FileBoundary[] = [];
  
  // If we have file paths from directory tree, try to find them in content
  const paths = filePaths || (directoryTree ? parseDirectoryTree(directoryTree) : []);
  
  for (const path of paths) {
    // Try to find file header pattern (common in gitingest output)
    const patterns = [
      `\n=== ${path} ===\n`,
      `\n--- ${path} ---\n`,
      `\nFILE: ${path}\n`,
      `\n${path}:\n`,
    ];
    
    for (const pattern of patterns) {
      const index = content.indexOf(pattern);
      if (index !== -1) {
        // Find end of this file (next file header or end of content)
        let endIndex = content.length;
        
        // Look for next file header
        for (const otherPath of paths) {
          if (otherPath === path) continue;
          
          const otherPatterns = [
            `\n=== ${otherPath} ===\n`,
            `\n--- ${otherPath} ---\n`,
            `\nFILE: ${otherPath}\n`,
            `\n${otherPath}:\n`,
          ];
          
          for (const otherPattern of otherPatterns) {
            const otherIndex = content.indexOf(otherPattern, index + 1);
            if (otherIndex !== -1 && otherIndex < endIndex) {
              endIndex = otherIndex;
            }
          }
        }
        
        // Determine priority based on file type
        let priority = 4; // default (other files)
        if (path.toLowerCase() === 'readme.md' || path.includes('README')) {
          priority = 1;
        } else if (path.toLowerCase().endsWith('.md')) {
          priority = 2;
        } else if (path.toLowerCase().endsWith('.js') || 
                   path.toLowerCase().endsWith('.ts') || 
                   path.toLowerCase().endsWith('.py')) {
          priority = 3;
        }
        
        boundaries.push({
          path,
          startOffset: index,
          endOffset: endIndex,
          priority
        });
        
        break; // Found this file, move to next
      }
    }
  }
  
  // Sort by start offset
  boundaries.sort((a, b) => a.startOffset - b.startOffset);
  
  return boundaries;
}

/**
 * Smart truncation with priority preservation
 * Preserves directory tree, README, and important files when truncating
 */
export function smartTruncate(
  content: string,
  directoryTree?: string,
  maxLength: number = CHARACTER_LIMIT
): { truncated: string; preserved: string[]; discarded: string[] } {
  if (content.length <= maxLength) {
    return {
      truncated: content,
      preserved: ['full content'],
      discarded: []
    };
  }
  
  const preserved: string[] = [];
  const discarded: string[] = [];
  
  // Always preserve directory tree section if present
  let truncated = '';
  if (directoryTree && content.includes(directoryTree)) {
    const treeStart = content.indexOf(directoryTree);
    const treeEnd = treeStart + directoryTree.length;
    truncated += content.substring(treeStart, treeEnd) + '\n\n';
    preserved.push('directory tree');
  }
  
  // Detect file boundaries
  const boundaries = detectFileBoundaries(content, directoryTree);
  
  // Sort boundaries by priority (lowest number = highest priority)
  const sortedBoundaries = [...boundaries].sort((a, b) => a.priority - b.priority);
  
  // Add files in priority order until we reach maxLength
  let currentLength = truncated.length;
  
  for (const boundary of sortedBoundaries) {
    const fileContent = content.substring(boundary.startOffset, boundary.endOffset);
    
    if (currentLength + fileContent.length <= maxLength) {
      truncated += fileContent + '\n\n';
      currentLength += fileContent.length + 2; // +2 for newlines
      preserved.push(boundary.path);
    } else {
      // Try to add partial content if it's high priority
      if (boundary.priority <= 2 && currentLength < maxLength) {
        const remainingSpace = maxLength - currentLength;
        const partialContent = fileContent.substring(0, remainingSpace - 100) + 
          `\n\n[Content truncated due to size limit. Original file: ${boundary.path}]`;
        truncated += partialContent;
        preserved.push(`${boundary.path} (partial)`);
        break;
      } else {
        discarded.push(boundary.path);
      }
    }
    
    if (currentLength >= maxLength) {
      break;
    }
  }
  
  // If we still have space, add remaining content
  if (currentLength < maxLength && truncated.length < content.length) {
    const remainingSpace = maxLength - currentLength;
    const remainingContent = content.substring(truncated.length, truncated.length + remainingSpace);
    truncated += remainingContent;
    preserved.push('remaining content');
  }
  
  // Ensure we don't exceed maxLength
  if (truncated.length > maxLength) {
    truncated = truncated.substring(0, maxLength);
  }
  
  return { truncated, preserved, discarded };
}

/**
 * Decompose structured content with metadata awareness
 */
export function decomposeStructured(
  content: string,
  metadata: {
    directoryTree?: string;
    filePaths?: string[];
    sourceType?: 'docs' | 'code' | 'mixed';
  },
  options: StructuredDecompositionOptions = {}
): Chunk[] {
  const {
    strategy,
    autoDetect = true,
    preserveTree = true,
    maxChunkSize = 10000,
    overlap = 200,
    linesPerChunk = 100,
    pattern
  } = options;
  
  // Apply smart truncation if content exceeds CHARACTER_LIMIT
  let processedContent = content;
  let truncationInfo: { preserved: string[]; discarded: string[] } | undefined;
  
  if (content.length > CHARACTER_LIMIT) {
    const result = smartTruncate(content, metadata.directoryTree, CHARACTER_LIMIT);
    processedContent = result.truncated;
    truncationInfo = {
      preserved: result.preserved,
      discarded: result.discarded
    };
    
    console.warn(`Content truncated from ${content.length} to ${processedContent.length} characters.`);
    console.warn(`Preserved: ${result.preserved.join(', ')}`);
    if (result.discarded.length > 0) {
      console.warn(`Discarded: ${result.discarded.join(', ')}`);
    }
  }
  
  // Determine decomposition strategy
  let finalStrategy = strategy;
  
  if (!finalStrategy && autoDetect) {
    // Auto-detect based on metadata and content
    if (metadata.sourceType === 'docs') {
      finalStrategy = DecompositionStrategy.BY_SECTIONS;
    } else if (metadata.sourceType === 'code') {
      finalStrategy = DecompositionStrategy.BY_LINES;
    } else if (metadata.directoryTree) {
      // For repository content with directory tree, use sections with file awareness
      finalStrategy = DecompositionStrategy.BY_SECTIONS;
    } else {
      // Default to fixed size
      finalStrategy = DecompositionStrategy.FIXED_SIZE;
    }
  }
  
  // Ensure we have a strategy (fallback to FIXED_SIZE)
  if (!finalStrategy) {
    finalStrategy = DecompositionStrategy.FIXED_SIZE;
  }
  
  // Get file boundaries for enhanced metadata
  const fileBoundaries = detectFileBoundaries(
    processedContent,
    metadata.directoryTree,
    metadata.filePaths
  );
  
  // Decompose using ContextProcessor
  const chunks = contextProcessor.decompose(processedContent, finalStrategy, {
    chunkSize: maxChunkSize,
    overlap,
    linesPerChunk,
    pattern
  });
  
  // Enhance chunks with file boundary metadata
  if (fileBoundaries.length > 0 && preserveTree) {
    return chunks.map(chunk => {
      // Find which file(s) this chunk overlaps with
      const overlappingFiles = fileBoundaries.filter(boundary =>
        (chunk.startOffset >= boundary.startOffset && chunk.startOffset < boundary.endOffset) ||
        (chunk.endOffset > boundary.startOffset && chunk.endOffset <= boundary.endOffset) ||
        (chunk.startOffset <= boundary.startOffset && chunk.endOffset >= boundary.endOffset)
      );
      
      const enhancedMetadata = {
        ...chunk.metadata,
        files: overlappingFiles.map(f => f.path),
        truncationInfo: truncationInfo
      };
      
      return {
        ...chunk,
        metadata: enhancedMetadata
      };
    });
  }
  
  return chunks;
}

/**
 * Extract file paths from directory tree for use in decomposition
 */
export function extractFilePaths(directoryTree: string): string[] {
  return parseDirectoryTree(directoryTree);
}