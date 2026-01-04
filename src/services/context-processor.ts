/**
 * Context Processor Service
 * Provides context decomposition, search, and manipulation utilities
 * These tools enable the client's LLM to implement RLM patterns
 */

import {
  Chunk,
  SearchMatch,
  DecompositionStrategy,
  StructureType
} from '../types.js';
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_OVERLAP,
  DEFAULT_LINES_PER_CHUNK,
  MAX_SEARCH_RESULTS
} from '../constants.js';

export class ContextProcessor {
  
  /**
   * Decompose context into chunks
   */
  decompose(
    content: string,
    strategy: DecompositionStrategy,
    options: {
      chunkSize?: number;
      overlap?: number;
      linesPerChunk?: number;
      separator?: string;
      pattern?: string;
    } = {}
  ): Chunk[] {
    switch (strategy) {
      case DecompositionStrategy.FIXED_SIZE:
        return this.decomposeBySize(
          content,
          options.chunkSize || DEFAULT_CHUNK_SIZE,
          options.overlap || DEFAULT_OVERLAP
        );
      
      case DecompositionStrategy.BY_LINES:
        return this.decomposeByLines(
          content,
          options.linesPerChunk || DEFAULT_LINES_PER_CHUNK,
          options.overlap || 10
        );
      
      case DecompositionStrategy.BY_PARAGRAPHS:
        return this.decomposeByParagraphs(content);
      
      case DecompositionStrategy.BY_SECTIONS:
        return this.decomposeBySections(content);
      
      case DecompositionStrategy.BY_REGEX:
        return this.decomposeByRegex(content, options.pattern || '\n\n+');
      
      case DecompositionStrategy.BY_SENTENCES:
        return this.decomposeBySentences(content);
      
      default:
        return this.decomposeBySize(content, DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP);
    }
  }

  /**
   * Fixed-size chunking with overlap
   */
  private decomposeBySize(content: string, chunkSize: number, overlap: number): Chunk[] {
    const chunks: Chunk[] = [];
    let index = 0;
    let offset = 0;

    while (offset < content.length) {
      const end = Math.min(offset + chunkSize, content.length);
      
      chunks.push({
        index,
        content: content.slice(offset, end),
        startOffset: offset,
        endOffset: end
      });

      offset += chunkSize - overlap;
      index++;

      // Prevent infinite loop
      if (chunkSize - overlap <= 0) break;
    }

    return chunks;
  }

  /**
   * Chunk by lines
   */
  private decomposeByLines(content: string, linesPerChunk: number, overlapLines: number): Chunk[] {
    const lines = content.split('\n');
    const chunks: Chunk[] = [];
    let index = 0;
    let lineIndex = 0;
    let charOffset = 0;

    while (lineIndex < lines.length) {
      const chunkLines = lines.slice(lineIndex, lineIndex + linesPerChunk);
      const chunkContent = chunkLines.join('\n');
      const endOffset = charOffset + chunkContent.length;

      chunks.push({
        index,
        content: chunkContent,
        startOffset: charOffset,
        endOffset,
        metadata: {
          startLine: lineIndex,
          endLine: Math.min(lineIndex + linesPerChunk, lines.length) - 1
        }
      });

      // Calculate next position
      const advanceLines = Math.max(1, linesPerChunk - overlapLines);
      for (let i = 0; i < advanceLines && lineIndex + i < lines.length; i++) {
        charOffset += lines[lineIndex + i].length + 1; // +1 for newline
      }
      
      lineIndex += advanceLines;
      index++;
    }

    return chunks;
  }

  /**
   * Chunk by paragraphs (double newlines)
   */
  private decomposeByParagraphs(content: string): Chunk[] {
    const paragraphs = content.split(/\n\n+/);
    const chunks: Chunk[] = [];
    let offset = 0;

    paragraphs.forEach((para, index) => {
      if (para.trim()) {
        const startOffset = content.indexOf(para, offset);
        chunks.push({
          index,
          content: para.trim(),
          startOffset,
          endOffset: startOffset + para.length
        });
        offset = startOffset + para.length;
      }
    });

    return chunks;
  }

  /**
   * Chunk by sections (markdown headers)
   */
  private decomposeBySections(content: string): Chunk[] {
    const sectionPattern = /^(#{1,6})\s+(.+)$/gm;
    const sections: Chunk[] = [];
    let lastIndex = 0;
    let index = 0;
    let match;

    const matches: Array<{ start: number; level: number; title: string }> = [];
    
    while ((match = sectionPattern.exec(content)) !== null) {
      matches.push({
        start: match.index,
        level: match[1].length,
        title: match[2]
      });
    }

    // If no sections found, return as single chunk
    if (matches.length === 0) {
      return [{
        index: 0,
        content: content,
        startOffset: 0,
        endOffset: content.length
      }];
    }

    // Add content before first section if any
    if (matches[0].start > 0) {
      const preContent = content.slice(0, matches[0].start).trim();
      if (preContent) {
        sections.push({
          index: index++,
          content: preContent,
          startOffset: 0,
          endOffset: matches[0].start,
          metadata: { type: 'preamble' }
        });
      }
    }

    // Process each section
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const next = matches[i + 1];
      const endOffset = next ? next.start : content.length;
      
      sections.push({
        index: index++,
        content: content.slice(current.start, endOffset).trim(),
        startOffset: current.start,
        endOffset,
        metadata: {
          level: current.level,
          title: current.title,
          type: 'section'
        }
      });
    }

    return sections;
  }

  /**
   * Chunk by custom regex pattern
   */
  private decomposeByRegex(content: string, pattern: string): Chunk[] {
    const regex = new RegExp(pattern, 'g');
    const parts = content.split(regex);
    const chunks: Chunk[] = [];
    let offset = 0;

    parts.forEach((part, index) => {
      if (part.trim()) {
        const startOffset = content.indexOf(part, offset);
        chunks.push({
          index,
          content: part.trim(),
          startOffset,
          endOffset: startOffset + part.length
        });
        offset = startOffset + part.length;
      }
    });

    return chunks;
  }

  /**
   * Chunk by sentences
   */
  private decomposeBySentences(content: string): Chunk[] {
    // Simple sentence splitting (handles common cases)
    const sentencePattern = /[^.!?]+[.!?]+\s*/g;
    const sentences: Chunk[] = [];
    let match;
    let index = 0;

    while ((match = sentencePattern.exec(content)) !== null) {
      sentences.push({
        index: index++,
        content: match[0].trim(),
        startOffset: match.index,
        endOffset: match.index + match[0].length
      });
    }

    // Handle content without sentence endings
    if (sentences.length === 0 && content.trim()) {
      return [{
        index: 0,
        content: content.trim(),
        startOffset: 0,
        endOffset: content.length
      }];
    }

    return sentences;
  }

  /**
   * Search content with regex
   */
  search(
    content: string,
    pattern: string,
    options: {
      flags?: string;
      contextChars?: number;
      maxResults?: number;
      includeLineNumbers?: boolean;
    } = {}
  ): SearchMatch[] {
    const {
      flags = 'gi',
      contextChars = 100,
      maxResults = MAX_SEARCH_RESULTS,
      includeLineNumbers = true
    } = options;

    const results: SearchMatch[] = [];
    
    try {
      const regex = new RegExp(pattern, flags);
      let match;
      
      while ((match = regex.exec(content)) !== null && results.length < maxResults) {
        const start = Math.max(0, match.index - contextChars);
        const end = Math.min(content.length, match.index + match[0].length + contextChars);
        
        let lineNumber = 0;
        if (includeLineNumbers) {
          lineNumber = content.slice(0, match.index).split('\n').length;
        }

        results.push({
          match: match[0],
          index: match.index,
          lineNumber,
          context: content.slice(start, end),
          groups: match.slice(1)
        });

        // Prevent infinite loop with zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    } catch (error) {
      // Invalid regex - return empty results
    }

    return results;
  }

  /**
   * Extract lines by range
   */
  extractLines(content: string, startLine: number, endLine?: number): string {
    const lines = content.split('\n');
    const end = endLine !== undefined ? endLine + 1 : startLine + 1;
    return lines.slice(startLine, end).join('\n');
  }

  /**
   * Extract by character range
   */
  extractRange(content: string, start: number, end: number): string {
    return content.slice(start, end);
  }

  /**
   * Get context summary statistics
   */
  getStatistics(content: string): {
    length: number;
    lineCount: number;
    wordCount: number;
    sentenceCount: number;
    paragraphCount: number;
    avgLineLength: number;
    avgWordLength: number;
  } {
    const lines = content.split('\n');
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);

    return {
      length: content.length,
      lineCount: lines.length,
      wordCount: words.length,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      avgLineLength: Math.round(content.length / lines.length),
      avgWordLength: Math.round(words.join('').length / words.length)
    };
  }

  /**
   * Find all occurrences of a substring
   */
  findAll(content: string, substring: string, caseSensitive: boolean = false): number[] {
    const indices: number[] = [];
    const searchContent = caseSensitive ? content : content.toLowerCase();
    const searchTerm = caseSensitive ? substring : substring.toLowerCase();
    
    let index = 0;
    while ((index = searchContent.indexOf(searchTerm, index)) !== -1) {
      indices.push(index);
      index += searchTerm.length;
    }
    
    return indices;
  }

  /**
   * Get suggested decomposition strategy based on content
   */
  suggestStrategy(content: string, structure: StructureType): {
    strategy: DecompositionStrategy;
    reason: string;
    options: Record<string, unknown>;
  } {
    const stats = this.getStatistics(content);

    // For structured data
    if (structure === StructureType.JSON) {
      return {
        strategy: DecompositionStrategy.FIXED_SIZE,
        reason: 'JSON data works best with fixed-size chunks to avoid breaking structure',
        options: { chunkSize: 20000, overlap: 500 }
      };
    }

    if (structure === StructureType.CSV) {
      return {
        strategy: DecompositionStrategy.BY_LINES,
        reason: 'CSV data should be chunked by rows to preserve record integrity',
        options: { linesPerChunk: 200, overlap: 0 }
      };
    }

    if (structure === StructureType.MARKDOWN) {
      return {
        strategy: DecompositionStrategy.BY_SECTIONS,
        reason: 'Markdown content has natural section boundaries',
        options: {}
      };
    }

    if (structure === StructureType.CODE) {
      return {
        strategy: DecompositionStrategy.BY_LINES,
        reason: 'Code should be chunked by lines to preserve context',
        options: { linesPerChunk: 100, overlap: 20 }
      };
    }

    if (structure === StructureType.LOG) {
      return {
        strategy: DecompositionStrategy.BY_LINES,
        reason: 'Log files are naturally line-based',
        options: { linesPerChunk: 500, overlap: 50 }
      };
    }

    // For plain text
    if (stats.paragraphCount > 10) {
      return {
        strategy: DecompositionStrategy.BY_PARAGRAPHS,
        reason: 'Document has clear paragraph structure',
        options: {}
      };
    }

    if (stats.length > 50000) {
      return {
        strategy: DecompositionStrategy.FIXED_SIZE,
        reason: 'Large document requires fixed-size chunking',
        options: { chunkSize: 10000, overlap: 200 }
      };
    }

    return {
      strategy: DecompositionStrategy.BY_SENTENCES,
      reason: 'Default to sentence-based chunking for general text',
      options: {}
    };
  }
}

// Singleton instance
export const contextProcessor = new ContextProcessor();
