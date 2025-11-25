#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  loadClaudeignorePatterns,
  isIgnored,
  hasClaudeignoreInProject,
  cleanupOldCaches
} = require('../lib/pattern-matcher');

/**
 * Extract file paths from tool input based on tool type.
 *
 * @param {string} toolName - Name of the tool being used
 * @param {object} toolInput - Tool input parameters
 * @returns {array} - Array of file paths to check
 */
function extractFilePaths(toolName, toolInput) {
  switch (toolName) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return [toolInput.file_path].filter(Boolean);

    case 'MultiEdit':
      return (toolInput.edits || []).map(e => e.file_path).filter(Boolean);

    case 'Glob':
      // For Glob, we check the path being globbed
      // If it's a directory, we allow it (pattern matching happens later)
      return [toolInput.path || process.cwd()];

    case 'Grep':
      // For Grep, we check the path being searched
      return [toolInput.path || process.cwd()];

    default:
      return [];
  }
}

/**
 * Main hook function.
 */
async function main() {
  try {
    // 1. Read stdin JSON
    const input = fs.readFileSync(0, 'utf-8');
    const inputData = JSON.parse(input);

    // 2. Extract tool info
    const { tool_name, tool_input, session_id } = inputData;

    // 3. Check if tool should be filtered
    const FILTERED_TOOLS = ['Read', 'Edit', 'Write', 'MultiEdit', 'Glob', 'Grep'];
    if (!FILTERED_TOOLS.includes(tool_name)) {
      process.exit(0); // Allow - tool not filtered
    }

    // 4. Extract file path(s)
    const filePaths = extractFilePaths(tool_name, tool_input);
    if (!filePaths || filePaths.length === 0) {
      process.exit(0); // Allow - no file paths to check
    }

    // 5. Quick check: Does .claudeignore exist in project?
    //    This is critical for zero-overhead on projects without .claudeignore
    const hasClaudeignore = await hasClaudeignoreInProject(filePaths[0]);
    if (!hasClaudeignore) {
      process.exit(0); // No .claudeignore = allow everything (ZERO OVERHEAD)
    }

    // 6. Cleanup old caches occasionally (10% chance)
    if (Math.random() < 0.1) {
      cleanupOldCaches();
    }

    // 7. Load .claudeignore patterns (with caching)
    const patterns = await loadClaudeignorePatterns(filePaths[0], session_id);

    // 8. Check if any file matches ignore patterns
    const blockedFiles = [];
    for (const filePath of filePaths) {
      if (isIgnored(filePath, patterns)) {
        blockedFiles.push(filePath);
      }
    }

    // 9. Block if any files are ignored
    if (blockedFiles.length > 0) {
      const fileList = blockedFiles.join(', ');
      console.error(`File(s) blocked by .claudeignore: ${fileList}`);
      process.exit(2); // Block tool execution
    }

    // 10. Allow tool execution
    process.exit(0);

  } catch (error) {
    // Log error but don't block - fail open for safety
    console.error(`Hook error: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    process.exit(1); // Error (shows to user but not Claude)
  }
}

// Run main function
main();
