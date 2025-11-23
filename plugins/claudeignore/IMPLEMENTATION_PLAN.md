# .claudeignore Plugin Implementation Plan

## Overview

This document outlines the implementation plan for the `.claudeignore` plugin for Claude Code. This plugin addresses GitHub issues [#1248](https://github.com/anthropics/claude-code/issues/1248), [#5105](https://github.com/anthropics/claude-code/issues/5105), [#620](https://github.com/anthropics/claude-code/issues/620), and [#2637](https://github.com/anthropics/claude-code/issues/2637).

## Problem Statement

Claude Code currently respects `.gitignore` files and excludes gitignored files from:
- `@`-mention autocomplete suggestions
- General file awareness and operations

This creates workflow friction when developers need:
1. **Local-only files** accessible to Claude but not committed to git (e.g., local notes, TODO lists)
2. **Un-ignoring gitignored files** for Claude to access (e.g., `.env.example`, documentation in `docs/` that's gitignored)
3. **Additional security** beyond `.gitignore` to protect sensitive files (e.g., `.env`, API keys)

## Why Existing Solutions Don't Work

The official workaround suggested in issue #5105 requires:
1. Changing **global Claude settings** to include all gitignored files everywhere
2. Adding `.claudeignore` to **every single project** to re-block files
3. Mandatory setup for every repository you work with

**This is backwards and impractical.** Our plugin takes the opposite, sane approach.

## Our Better Approach: Opt-In Per Project

### Default Behavior (Zero Setup Required)

- `.gitignore` continues to work exactly as today
- Gitignored files stay hidden from Claude
- **No global configuration changes needed**
- **No .claudeignore file required** unless you want to override
- Works across all projects without any setup
- **Zero performance overhead** when no `.claudeignore` exists

### Opt-In Override (Only When Needed)

- Add `.claudeignore` to specific projects where you need control
- Use **negation patterns (`!`)** to selectively expose gitignored files:
  ```gitignore
  # Un-ignore specific gitignored files
  !.env.example
  !docs/
  !TODO.md
  !*.local.md
  ```
- Add additional ignore patterns for extra security:
  ```gitignore
  # Block files that aren't gitignored
  .env
  *.key
  credentials.json
  ```
- Only affects the projects where you add the file

## Inspiration: Cursor AI's `.cursorignore`

Cursor AI successfully implements `.cursorignore` with these characteristics:
- Uses `.gitignore` syntax for consistency
- Supports both ignoring additional files AND un-ignoring gitignored files
- Filters files from AI access and indexing
- Best-effort security (not a guarantee, but effective)
- Scans for secrets before uploading

## Solution Design

### Implementation Approach

**Phase 1: External Plugin (This Implementation)**
- Develop as standalone Claude Code plugin using **Node.js**
- Use PreToolUse hooks for file access control
- Distribute via custom marketplace
- Iterate based on community feedback
- Test locally within claude-code repository during development

**Phase 2: Potential Official Integration (Future)**
- After validation and community adoption
- Propose inclusion in official plugins directory
- Work with core team on `@` mention filtering (may require core changes)

### Architecture

```
claudeignore/
├── .claude-plugin/
│   ├── plugin.json           # Plugin metadata
│   └── marketplace.json      # Marketplace configuration (for distribution)
├── hooks/
│   ├── hooks.json            # Hook configuration
│   └── claudeignore-hook.js  # Main hook implementation (Node.js)
├── lib/                      # Shared library code
│   ├── pattern-matcher.js    # Gitignore pattern matching using 'ignore' pkg
│   └── file-discovery.js     # .claudeignore file discovery logic
├── tests/                    # Test suite
│   ├── pattern-matcher.test.js
│   ├── hook.test.js
│   └── fixtures/
│       └── sample-claudeignore/
├── examples/
│   ├── .claudeignore.example          # Example .claudeignore file
│   └── .claudeignore.security.example # Security-focused example
├── package.json              # npm dependencies
├── README.md                 # Plugin documentation
├── IMPLEMENTATION_PLAN.md    # This file
└── CONTRIBUTING.md           # Contribution guidelines
```

## Functional Requirements

### 1. .claudeignore File Discovery

The plugin must:
- **Only activate if `.claudeignore` exists** in the project
- If no `.claudeignore` file exists, hook exits immediately (zero overhead)
- Search for `.claudeignore` files starting from the file being accessed
- Walk up the directory tree to find all `.claudeignore` files (similar to how git handles `.gitignore`)
- Support hierarchical `.claudeignore` files (child overrides parent)
- Cache discovery results per session for performance
- Stop at git root or filesystem root

### 2. Pattern Syntax Support

Support full gitignore syntax:
- **Negation patterns**: `!pattern` to un-ignore files (PRIMARY USE CASE)
- **Directory patterns**: `dir/` to match directories
- **Wildcard patterns**: `*.log`, `test*`, etc.
- **Path patterns**: `path/to/file` for specific paths
- **Comments**: `# comment` lines
- **Blank lines**: Ignored
- **Escape sequences**: `\#` for literal `#`

### 3. Pattern Precedence Rules

1. `.claudeignore` patterns take precedence over `.gitignore`
2. Negation patterns (`!`) can un-ignore gitignored files
3. More specific patterns override general patterns
4. Later patterns override earlier patterns in the same file
5. Child directory `.claudeignore` overrides parent directory patterns

### 4. Tool Filtering Scope

Block/filter files matching `.claudeignore` patterns for:

**✅ Phase 1 (Plugin Implementation):**
- `Read` tool - Prevent reading file contents
- `Edit` tool - Prevent editing files
- `Write` tool - Prevent writing to files
- `MultiEdit` tool - Prevent batch edits
- `Glob` tool - Filter files from glob results
- `Grep` tool - Filter files from grep results

**⚠️ Phase 1 Limitations:**
- `@` mention autocomplete - Cannot fully filter without core changes
  - **Workaround**: Document that users should use keyboard shortcuts (Cmd+Option+K in VSCode) for ignored files
  - **Future**: Work with core team to add hook support for autocomplete filtering

**🔮 Phase 2 (Potential Core Integration):**
- `@` mention autocomplete filtering
- Initial directory snapshot filtering

### 5. Security Considerations

- **Exit code 2**: Block tool execution when pattern matches
- **Session-scoped warnings**: Track warnings per session to avoid spam
- **Clear error messages**: Simple format: "File blocked by .claudeignore: {path}"
- **Pattern validation**: Detect and warn about invalid patterns
- **Performance**: Efficient pattern matching for large codebases
- **Secret scanning**: Recommend patterns for common secret files

### 6. User Experience

- **Zero configuration**: Works without any setup by default
- **Opt-in activation**: Only affects projects with `.claudeignore` file
- **Clear feedback**: Simple error messages when access is blocked
- **Example files**: Provide templates for common use cases
- **Documentation**: Comprehensive README with examples
- **Error recovery**: Graceful handling of malformed `.claudeignore` files

## Technical Implementation

### 1. Pattern Matching Library

**Choice: `ignore` npm package**
- Most popular gitignore parser (48M weekly downloads)
- Used by eslint, prettier, and many others
- Fully compliant with gitignore spec 2.22.1
- Pure JavaScript implementation
- Active maintenance
- Supports all gitignore features including negation patterns

**Why Node.js?**
- Claude Code requires Node.js 18+ (already installed)
- Your preferred language for easier maintenance
- Community plugins successfully use Node.js
- Better performance than Python for file operations
- Rich npm ecosystem
- Simpler installation (`npm install` in plugin directory)

### 2. Hook Implementation

**PreToolUse Hook (Node.js):**

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadClaudeignorePatterns, isIgnored } = require('../lib/pattern-matcher');

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
      process.exit(0); // Allow
    }

    // 4. Extract file path(s)
    const filePaths = extractFilePaths(tool_name, tool_input);
    if (!filePaths || filePaths.length === 0) {
      process.exit(0); // Allow
    }

    // 5. Quick check: Does .claudeignore exist in project?
    //    This is critical for zero-overhead on projects without .claudeignore
    const hasClaudeignore = await hasClaudeignoreInProject(filePaths[0]);
    if (!hasClaudeignore) {
      process.exit(0); // No .claudeignore = allow everything (ZERO OVERHEAD)
    }

    // 6. Load .claudeignore patterns (cached per session)
    const patterns = await loadClaudeignorePatterns(filePaths[0], session_id);

    // 7. Check if any file matches ignore patterns
    for (const filePath of filePaths) {
      if (isIgnored(filePath, patterns)) {
        console.error(`File blocked by .claudeignore: ${filePath}`);
        process.exit(2); // Block
      }
    }

    // 8. Allow tool execution
    process.exit(0);
  } catch (error) {
    console.error(`Hook error: ${error.message}`);
    process.exit(1); // Error (shows to user but not Claude)
  }
}

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
      return [toolInput.path || '.'];
    case 'Grep':
      // For Grep, we check the path being searched
      return [toolInput.path || '.'];
    default:
      return [];
  }
}

async function hasClaudeignoreInProject(filePath) {
  // Quick check: walk up to git root looking for .claudeignore
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

main();
```

### 3. Pattern Discovery Algorithm

```javascript
// lib/pattern-matcher.js

const fs = require('fs');
const path = require('path');
const ignore = require('ignore');

async function loadClaudeignorePatterns(filePath, sessionId) {
  /**
   * Load all .claudeignore patterns from current directory upward.
   * Returns an 'ignore' instance with all patterns loaded.
   */
  const ig = ignore();
  let currentDir = path.dirname(path.resolve(filePath));
  const patterns = [];

  // Walk up directory tree
  while (true) {
    const claudeignorePath = path.join(currentDir, '.claudeignore');

    if (fs.existsSync(claudeignorePath)) {
      const content = fs.readFileSync(claudeignorePath, 'utf-8');
      patterns.push({ path: claudeignorePath, content });
    }

    // Stop at git root or filesystem root
    if (fs.existsSync(path.join(currentDir, '.git')) ||
        currentDir === '/' ||
        currentDir === path.parse(currentDir).root) {
      break;
    }

    currentDir = path.dirname(currentDir);
  }

  // Add patterns to ignore instance (reverse order for proper precedence)
  patterns.reverse().forEach(({ content }) => {
    ig.add(content);
  });

  return ig;
}

function isIgnored(filePath, ignoreInstance) {
  /**
   * Check if a file path is ignored by the patterns.
   * Returns true if file should be blocked.
   */
  const relativePath = path.relative(process.cwd(), filePath);
  return ignoreInstance.ignores(relativePath);
}

module.exports = {
  loadClaudeignorePatterns,
  isIgnored
};
```

### 4. Caching Strategy

**Session-scoped cache:**
- Cache pattern discovery per session ID
- Cache file in `~/.claude/claudeignore_cache_{session_id}.json`
- Cache structure:
  ```json
  {
    "patterns": [...],
    "files": ["/path/.claudeignore", ...],
    "mtimes": [1234567890, ...],
    "git_root": "/path/to/repo"
  }
  ```
- Invalidate cache if any `.claudeignore` file modified
- Clean up caches older than 7 days

## Testing Strategy

### 1. Manual Testing (Phase 1)

**Testing in Claude Code Repository:**
1. Create `.claudeignore` in claude-code repo
2. Add patterns to un-ignore and ignore files
3. Ask Claude to read ignored files
4. Verify blocking behavior
5. Test negation patterns
6. Test each tool type (Read, Edit, Write, Glob, Grep)

### 2. Unit Tests (Future)

**Pattern Matching Tests:**
- Test basic patterns: `*.log`, `node_modules/`, etc.
- Test negation patterns: `!important.log`
- Test directory patterns: `logs/`
- Test path patterns: `src/secret.key`
- Test precedence rules
- Test edge cases: spaces, special chars, unicode

**File Discovery Tests:**
- Test hierarchical discovery
- Test git root detection
- Test cache invalidation
- Test multiple `.claudeignore` files

### 3. Integration Tests (Future)

**Real-world Scenarios:**
- Test with actual `.claudeignore` files
- Test performance with large codebases
- Test with nested directory structures
- Test with symlinks

## Documentation Requirements

### 1. README.md

**Sections:**
- Overview and problem statement
- Why this is better than the official workaround
- Installation instructions (`npm install` in plugin directory)
- Quick start guide (create `.claudeignore` in your project)
- Pattern syntax reference
- Examples (basic, advanced, security)
- Comparison with Cursor's `.cursorignore`
- Troubleshooting
- FAQ
- Contributing
- License

### 2. Example Files

**`.claudeignore.example` - Un-ignore gitignored files:**
```gitignore
# Un-ignore local development files
!.env.example
!.env.template
!TODO.md
!NOTES.md
!*.local.md

# Un-ignore documentation (might be gitignored)
!docs/
!README*.md
```

**`.claudeignore.security.example` - Block sensitive files:**
```gitignore
# Credentials and secrets
.env
.env.*
!.env.example
*.key
*.pem
credentials.json
secrets.yaml

# Configuration with secrets
config/production.yaml
config/staging.yaml

# Build artifacts with embedded secrets
dist/
build/
```

### 3. Cursor Comparison Document

**`docs/CURSOR_COMPARISON.md`:**
- Feature comparison table
- Syntax compatibility (100% compatible)
- Implementation differences
- Migration guide from Cursor

## Development Phases

### Phase 1: Core Implementation (Week 1)

**Day 1: Setup**
- [x] Create plugin directory structure
- [ ] Create `package.json` with dependencies
- [ ] Set up `.claude-plugin/plugin.json`
- [ ] Install `ignore` package

**Day 2: Pattern Matching**
- [ ] Implement `lib/pattern-matcher.js`
- [ ] Implement file discovery logic
- [ ] Test pattern matching with examples

**Day 3: Hook Implementation**
- [ ] Implement `hooks/claudeignore-hook.js`
- [ ] Add file path extraction for all tools
- [ ] Test hook with Read/Edit/Write

**Day 4: Extended Tool Support**
- [ ] Add support for MultiEdit
- [ ] Add support for Glob/Grep
- [ ] Test all tools

**Day 5: Documentation**
- [ ] Write comprehensive README.md
- [ ] Create example `.claudeignore` files
- [ ] Add usage examples

**Day 6: Testing**
- [ ] Manual testing in claude-code repo
- [ ] Test with real-world scenarios
- [ ] Fix any issues found

**Day 7: Distribution**
- [ ] Create `.claude-plugin/marketplace.json`
- [ ] Test plugin installation
- [ ] Prepare for external repository

## Implementation Decisions (Finalized)

✅ **Language**: Node.js/JavaScript (easier to maintain, Claude Code requires Node.js anyway)
✅ **Dependencies**: npm `ignore` package (document `npm install` in plugin directory)
✅ **Error Messages**: Simple format: "File blocked by .claudeignore: {path}"
✅ **Cache Location**: `~/.claude/claudeignore_cache_{session_id}.json`
✅ **Testing Setup**: Manual testing first, add Jest later if needed
✅ **Default Behavior**: Zero overhead - if no `.claudeignore` exists, hook exits immediately
✅ **Activation**: Opt-in per project (add `.claudeignore` only where needed)

## Success Metrics

### Adoption Metrics
- Number of installations
- GitHub stars/forks
- Community feedback and issues

### Quality Metrics
- Zero critical security issues
- Response time <10ms per file check when .claudeignore exists
- Zero overhead when .claudeignore doesn't exist
- Memory usage <5MB per session

### Community Metrics
- GitHub issue responses
- Pull request contributions
- Documentation clarity feedback

## Migration Path to Official Repo

If/when plugin proves successful:

1. **Demonstrate Value**
   - Show adoption numbers
   - Collect user testimonials
   - Document common use cases
   - Reference issues #1248, #5105, #620, #2637

2. **Propose Integration**
   - Open GitHub issue proposing inclusion
   - Reference external plugin success
   - Highlight advantages over current workaround
   - Offer to maintain if accepted

3. **Core Team Collaboration**
   - Work on @ mention filtering
   - Integrate with directory snapshot
   - Follow their review process

4. **Transition Plan**
   - Maintain external version for older Claude Code versions
   - Coordinate deprecation timeline
   - Provide migration guide for users

## Next Steps

1. ✅ Implementation plan approved
2. ⏭️ Create `package.json` and install dependencies
3. ⏭️ Implement pattern matching module
4. ⏭️ Implement PreToolUse hook
5. ⏭️ Create plugin metadata files
6. ⏭️ Test locally

---

**Document Version**: 2.0
**Last Updated**: 2025-01-14
**Status**: Ready to implement
