#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ignore = require('ignore');
const os = require('os');

/**
 * Load all .claudeignore patterns from current directory upward.
 * Returns an 'ignore' instance with all patterns loaded.
 *
 * @param {string} filePath - Path to the file being checked
 * @param {string} sessionId - Session ID for caching
 * @returns {Promise<object>} - Ignore instance with patterns loaded
 */
async function loadClaudeignorePatterns(filePath, sessionId) {
  const ig = ignore();
  let currentDir = path.dirname(path.resolve(filePath));
  const patterns = [];
  let gitRoot = null;

  // Walk up directory tree
  while (true) {
    const claudeignorePath = path.join(currentDir, '.claudeignore');

    if (fs.existsSync(claudeignorePath)) {
      try {
        const content = fs.readFileSync(claudeignorePath, 'utf-8');
        patterns.push({
          path: claudeignorePath,
          content,
          dir: currentDir
        });
      } catch (error) {
        console.error(`Warning: Could not read .claudeignore at ${claudeignorePath}: ${error.message}`);
      }
    }

    // Check if this is git root
    if (fs.existsSync(path.join(currentDir, '.git'))) {
      gitRoot = currentDir;
    }

    // Stop at git root or filesystem root
    if (gitRoot || currentDir === '/' || currentDir === path.parse(currentDir).root) {
      break;
    }

    currentDir = path.dirname(currentDir);
  }

  // Add patterns to ignore instance (reverse order for proper precedence)
  // Parent directories first, then child directories (child overrides parent)
  patterns.reverse().forEach(({ content, dir }) => {
    ig.add(content);
  });

  return {
    ignoreInstance: ig,
    gitRoot: gitRoot || currentDir,
    patternFiles: patterns.map(p => p.path)
  };
}

/**
 * Check if a file path is ignored by the patterns.
 * Returns true if file should be blocked (access denied).
 *
 * @param {string} filePath - Absolute path to file being checked
 * @param {object} patterns - Result from loadClaudeignorePatterns
 * @returns {boolean} - True if file should be blocked
 */
function isIgnored(filePath, patterns) {
  const { ignoreInstance, gitRoot } = patterns;

  // Get path relative to git root for pattern matching
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(gitRoot, absolutePath);

  // If path is outside git root, don't block it
  if (relativePath.startsWith('..')) {
    return false;
  }

  // Check if the file matches ignore patterns
  return ignoreInstance.ignores(relativePath);
}

/**
 * Check if .claudeignore exists anywhere in the project.
 * This is a quick check to enable zero-overhead for projects without .claudeignore.
 *
 * @param {string} filePath - Any file path in the project
 * @returns {Promise<boolean>} - True if .claudeignore exists
 */
async function hasClaudeignoreInProject(filePath) {
  let currentDir = path.dirname(path.resolve(filePath));

  while (true) {
    if (fs.existsSync(path.join(currentDir, '.claudeignore'))) {
      return true;
    }

    // Stop at git root or filesystem root
    if (fs.existsSync(path.join(currentDir, '.git')) ||
        currentDir === '/' ||
        currentDir === path.parse(currentDir).root) {
      break;
    }

    currentDir = path.dirname(currentDir);
  }

  return false;
}

/**
 * Get cache file path for session.
 *
 * @param {string} sessionId - Session ID
 * @returns {string} - Path to cache file
 */
function getCacheFilePath(sessionId) {
  const claudeDir = path.join(os.homedir(), '.claude');
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }
  return path.join(claudeDir, `claudeignore_cache_${sessionId}.json`);
}

/**
 * Load patterns from cache if valid.
 *
 * @param {string} sessionId - Session ID
 * @param {string} gitRoot - Git root directory
 * @returns {object|null} - Cached patterns or null if invalid
 */
function loadFromCache(sessionId, gitRoot) {
  try {
    const cacheFile = getCacheFilePath(sessionId);
    if (!fs.existsSync(cacheFile)) {
      return null;
    }

    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));

    // Verify cache is for the same git root
    if (cache.gitRoot !== gitRoot) {
      return null;
    }

    // Check if any .claudeignore files have been modified
    for (let i = 0; i < cache.files.length; i++) {
      const filePath = cache.files[i];
      const cachedMtime = cache.mtimes[i];

      if (!fs.existsSync(filePath)) {
        return null; // File was deleted
      }

      const currentMtime = fs.statSync(filePath).mtimeMs;
      if (currentMtime !== cachedMtime) {
        return null; // File was modified
      }
    }

    return cache.patterns;
  } catch (error) {
    return null; // Cache invalid or corrupted
  }
}

/**
 * Save patterns to cache.
 *
 * @param {string} sessionId - Session ID
 * @param {string} gitRoot - Git root directory
 * @param {array} patternFiles - List of .claudeignore file paths
 * @param {string} patternsStr - Serialized patterns
 */
function saveToCache(sessionId, gitRoot, patternFiles, patternsStr) {
  try {
    const cacheFile = getCacheFilePath(sessionId);
    const mtimes = patternFiles.map(f => fs.statSync(f).mtimeMs);

    const cache = {
      gitRoot,
      files: patternFiles,
      mtimes,
      patterns: patternsStr,
      timestamp: Date.now()
    };

    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  } catch (error) {
    // Silently fail - caching is optional
  }
}

/**
 * Clean up old cache files (older than 7 days).
 */
function cleanupOldCaches() {
  try {
    const claudeDir = path.join(os.homedir(), '.claude');
    if (!fs.existsSync(claudeDir)) {
      return;
    }

    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const files = fs.readdirSync(claudeDir);

    for (const file of files) {
      if (file.startsWith('claudeignore_cache_')) {
        const filePath = path.join(claudeDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtimeMs < sevenDaysAgo) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (error) {
    // Silently fail - cleanup is optional
  }
}

module.exports = {
  loadClaudeignorePatterns,
  isIgnored,
  hasClaudeignoreInProject,
  cleanupOldCaches
};
