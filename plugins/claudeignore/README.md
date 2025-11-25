# .claudeignore Plugin for Claude Code

> **⚠️ CRITICAL LIMITATION: This plugin cannot affect `@` file autocomplete.** The `@` autocomplete is a core Claude Code UI feature that only respects `.gitignore` - there is no plugin API to customize it. This plugin only filters tool access (Read/Write/Edit), not file discovery in the UI. See [Limitations](#critical-limitation-autocomplete-not-supported) below.

Control which files Claude can access using `.claudeignore` files with gitignore syntax. **Zero overhead** when not in use - only activates in projects where you add a `.claudeignore` file.

## Critical Limitation: Autocomplete Not Supported

**This plugin was built to solve a real problem, but it cannot fully solve it due to Claude Code architectural limitations.**

### What This Plugin CAN Do
- ✅ Block Claude from reading/writing files via tool calls (Read, Write, Edit, Glob, Grep)
- ✅ Add extra security by blocking sensitive files
- ✅ Use gitignore syntax with negation patterns

### What This Plugin CANNOT Do
- ❌ **Show gitignored files in `@` autocomplete** - This is the primary use case users want
- ❌ Modify which files appear when you type `@`
- ❌ Un-ignore gitignored files for file discovery

The `@` autocomplete is implemented in Claude Code's core Rust-based fuzzy finder. There are **no hooks, settings, or plugin APIs** to customize it. This would require changes to Claude Code itself.

### The Practical Impact

If you have a gitignored `tasks/` directory and add `!tasks/` to `.claudeignore`:
- Typing `@tasks` will show **nothing** (autocomplete ignores it)
- Manually asking Claude to "read tasks/README.md" **will work** (tool access is allowed)

This makes the plugin impractical for the primary use case of discovering and referencing gitignored files.

## Why This Plugin Exists

### The Problem

Claude Code respects `.gitignore` by default, which blocks access to files that developers often want Claude to see:
- `.env.example` and other template files
- `TODO.md` and `NOTES.md` for project context
- Local documentation that's gitignored
- Project-specific configuration examples

### The Official "Solution" (Impractical)

The Anthropic team's [official workaround](https://github.com/anthropics/claude-code/issues/5105) (as of v2.0.27) requires you to:

1. **Disable "Respect .gitignore in file picker"** in `/config` - This makes **ALL** gitignored files visible globally
2. **Create a `.ignore` file** in every project to re-block sensitive files
3. **Repeat for every project** you work on

**Problems with this approach:**
- **Security risk**: All gitignored files become visible by default, including `.env`, credentials, secrets
- **Backwards model**: Instead of opting-in to expose specific files, you must opt-out to protect everything
- **Per-project overhead**: Every project needs a `.ignore` file to block sensitive files
- **No negation support**: `.ignore` only blocks files, you can't selectively un-ignore specific gitignored files

### Our Attempted Solution: Opt-In Per Project

This plugin was designed to invert the approach:
- **Zero overhead** - does nothing unless `.claudeignore` exists in your project
- **Opt-in per project** - only activates where you need it
- **Primary use case: un-ignore gitignored files** using negation patterns (`!`)
- **Secondary use case: add extra security** by blocking sensitive files
- **No global configuration changes required**

**However, due to the autocomplete limitation, the primary use case doesn't work in practice.**

Inspired by [Cursor's `.cursorignore`](https://docs.cursor.com/context/ignore-files) but blocked by Claude Code's architecture.

## How It Works

### Zero-Overhead Activation

1. If no `.claudeignore` exists in your project: **plugin does nothing** (immediate exit)
2. If `.claudeignore` exists: plugin activates and filters file access
3. Patterns are cached per-session for performance
4. Hierarchical discovery: walks up to git root finding all `.claudeignore` files

### Tool Filtering

The plugin filters these Claude Code tools:
- `Read` - reading file contents
- `Edit` - editing files
- `Write` - writing new files
- `MultiEdit` - batch editing
- `Glob` - file pattern matching
- `Grep` - content searching

When a tool tries to access a blocked file, the hook returns exit code 2, preventing access.

## Installation

### Prerequisites

- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- Node.js 18+ (Claude Code already requires this)

### Option 1: Install from Marketplace (Recommended)

Once published to a Claude Code marketplace:

```bash
# In your project directory
claude

# Then use the plugin command
/plugin install claudeignore
```

### Option 2: Install from This Repository (Development)

For testing or development before marketplace publication:

1. **Clone the claude-code repository** (if you haven't already):
   ```bash
   git clone https://github.com/anthropics/claude-code.git
   cd claude-code/plugins/claudeignore
   ```

2. **Install plugin dependencies**:
   ```bash
   npm install
   ```

3. **Configure Claude Code to use this plugin**:

   In your project, create or edit `.claude/settings.json`:
   ```json
   {
     "plugins": [
       {
         "path": "/absolute/path/to/claude-code/plugins/claudeignore"
       }
     ]
   }
   ```

   Replace `/absolute/path/to/claude-code` with your actual path.

4. **Restart Claude Code**:
   ```bash
   # Exit current session (Ctrl+D or type "exit")
   # Start Claude Code again
   claude
   ```

### Option 3: Manual Installation

If you want to install the plugin globally for all projects:

1. **Create Claude Code plugins directory** (if it doesn't exist):
   ```bash
   mkdir -p ~/.claude/plugins
   ```

2. **Copy or clone plugin**:
   ```bash
   # Copy from claude-code repo
   cp -r /path/to/claude-code/plugins/claudeignore ~/.claude/plugins/

   # Or clone directly
   cd ~/.claude/plugins
   git clone https://github.com/anthropics/claude-code.git
   cp -r claude-code/plugins/claudeignore .
   rm -rf claude-code
   ```

3. **Install dependencies**:
   ```bash
   cd ~/.claude/plugins/claudeignore
   npm install
   ```

4. **Configure in global settings** (optional):

   Edit `~/.claude/settings.json`:
   ```json
   {
     "plugins": [
       {
         "path": "~/.claude/plugins/claudeignore"
       }
     ]
   }
   ```

5. **Restart Claude Code**

### Verify Installation

After installation, verify the plugin is loaded:

```bash
claude

# In Claude Code, check hooks are registered
# The plugin will show in logs if activated
```

Or test the hook directly:

```bash
cd ~/.claude/plugins/claudeignore
echo '{"tool_name":"Read","tool_input":{"file_path":"test.txt"},"session_id":"test"}' | node hooks/claudeignore-hook.js
echo $?  # Should output 0 (allow) if no .claudeignore exists
```

The plugin uses the `ignore` npm package (48M weekly downloads, used by eslint/prettier) for gitignore-spec-compliant pattern matching.

## Quick Start

### Use Case 1: Un-Ignore Gitignored Files (PRIMARY)

Most developers want Claude to see files that are gitignored for privacy but useful for context.

Create `.claudeignore` in your project root:

```gitignore
# Un-ignore local development files
!.env.example
!.env.template
!.env.development.example
!TODO.md
!NOTES.md
!*.local.md

# Un-ignore documentation (might be gitignored)
!docs/
!*.md
!README*.md

# Un-ignore configuration examples
!config/database.example.yml
!config/api.example.json
```

**How negation works:**
- If `.env.example` is in `.gitignore`, Claude can't see it
- Adding `!.env.example` to `.claudeignore` **un-ignores** it for Claude
- Now Claude can read `.env.example` even though it's gitignored

### Use Case 2: Add Extra Security (SECONDARY)

Block sensitive files even if they're NOT in `.gitignore`:

```gitignore
# Block all environment files (except examples)
.env
.env.*
!.env.example
!.env.template

# Block credentials and keys
*.key
*.pem
*.p12
credentials.json
secrets.yaml

# Block AWS/GCP credentials
.aws/
gcloud-key.json
service-account*.json

# Block database dumps
*.sql
*.dump
*.backup
```

### Combined Example

You can do both - un-ignore useful files AND block sensitive ones:

```gitignore
# Un-ignore useful gitignored files
!.env.example
!TODO.md
!docs/
!*.md

# But block sensitive files
.env
.env.production
.env.staging
*.key
*.pem
credentials.json
secrets.yaml
terraform.tfstate
```

## Pattern Syntax

`.claudeignore` uses standard [gitignore syntax](https://git-scm.com/docs/gitignore):

### Basic Patterns

```gitignore
# Comments start with #
*.log              # Block all .log files
logs/              # Block entire logs directory
temp*              # Block files starting with 'temp'
**/node_modules/   # Block node_modules anywhere
```

### Negation (Un-Ignoring)

```gitignore
# Block all .env files
.env*

# But allow .env.example
!.env.example
```

**Order matters!** Block patterns first, then negate:

```gitignore
# ✅ CORRECT - blocks all .env, then un-ignores .env.example
.env*
!.env.example

# ❌ WRONG - negation is overridden by later block
!.env.example
.env*
```

### Directory Patterns

```gitignore
# Block directory and everything inside
build/

# Block only files directly in directory (not subdirectories)
logs/*.log

# Block files in any subdirectory
**/secrets/*.json
```

### Hierarchical .claudeignore Files

Like `.gitignore`, you can have multiple `.claudeignore` files:

```
/project-root/.claudeignore        # Applies to entire project
/project-root/src/.claudeignore    # Applies to src/ and below
```

Child directories override parent patterns. Plugin walks up to git root loading all `.claudeignore` files.

## Examples

See the `examples/` directory:
- `.claudeignore.example` - Un-ignoring gitignored files (primary use case)
- `.claudeignore.security` - Security-focused blocking (secondary use case)

Copy one to your project root as `.claudeignore` and customize.

## Comparison with Cursor

This plugin is inspired by [Cursor's `.cursorignore`](https://docs.cursor.com/context/ignore-files) but adapted for Claude Code:

| Feature | Cursor `.cursorignore` | This Plugin `.claudeignore` |
|---------|----------------------|----------------------------|
| Activation | Always active | Zero overhead (opt-in per project) |
| Syntax | Gitignore | Gitignore |
| Negation | Yes (`!`) | Yes (`!`) |
| Hierarchical | Yes | Yes |
| Primary use case | Control indexing | Un-ignore gitignored files |
| Tool filtering | File indexing | Read/Edit/Write/Glob/Grep |

## Troubleshooting

### Plugin Not Working

1. **Check plugin is installed:**
   ```bash
   ls -la /path/to/claude-code/plugins/claudeignore
   ```

2. **Check dependencies installed:**
   ```bash
   cd /path/to/claude-code/plugins/claudeignore
   npm install
   ```

3. **Check `.claudeignore` exists in project:**
   ```bash
   cat .claudeignore
   ```

4. **Test the hook directly:**
   ```bash
   cd /path/to/claude-code/plugins/claudeignore
   echo '{"tool_name":"Read","tool_input":{"file_path":"/path/to/file.txt"},"session_id":"test"}' | node hooks/claudeignore-hook.js
   echo $?  # Should be 0 (allow) or 2 (block)
   ```

### File Still Blocked

1. **Check pattern order** - negations must come AFTER blocks:
   ```gitignore
   # ✅ CORRECT
   .env*
   !.env.example

   # ❌ WRONG
   !.env.example
   .env*
   ```

2. **Check relative paths** - patterns are relative to git root:
   ```gitignore
   # If file is at /project/src/.env.example
   # Use relative path from project root:
   !src/.env.example
   # NOT absolute path:
   !/project/src/.env.example
   ```

3. **Test pattern matching:**
   ```bash
   # Create test file with your patterns
   cat > test-ignore.txt << 'EOF'
   .env*
   !.env.example
   EOF

   # Test with node
   node -e "
   const ignore = require('ignore');
   const ig = ignore().add(require('fs').readFileSync('test-ignore.txt', 'utf-8'));
   console.log('Blocks .env:', ig.ignores('.env'));
   console.log('Blocks .env.example:', ig.ignores('.env.example'));
   "
   ```

### Cache Issues

Session cache is stored in `~/.claude/claudeignore_cache_*.json`:

```bash
# Clear all caches
rm ~/.claude/claudeignore_cache_*.json

# View cache for debugging
cat ~/.claude/claudeignore_cache_*.json
```

Cache automatically cleans up files older than 7 days.

## FAQ

### Why is the official workaround "backwards"?

The [official workaround](https://github.com/anthropics/claude-code/issues/5105#issuecomment-3533681307) requires:
1. Global setting to **always** include gitignored files
2. `.claudeignore` in **every** project to block sensitive files

This makes gitignored files visible by default and requires mandatory setup everywhere.

Our plugin inverts this:
1. **Zero overhead** - does nothing unless `.claudeignore` exists
2. **Opt-in per project** - only activates where needed
3. **Primary use case: un-ignore** using negation patterns

### Do I need to change global Claude Code settings?

No! This plugin works without any global configuration changes. Just add `.claudeignore` to projects where you need it.

### What's the performance impact?

**Zero overhead when `.claudeignore` doesn't exist** - the hook exits immediately.

When `.claudeignore` exists:
- First access: ~5-10ms (pattern loading)
- Subsequent accesses: ~1ms (session cache hit)
- Cache cleanup: automatic (7 days retention)

### Can I use this with the official workaround?

Yes, but you don't need to. This plugin works standalone without changing global settings.

If you've already enabled "Always include gitignored files" globally, this plugin adds an extra layer of per-project control.

### Does this work with @-mentions in chat?

**No, and it cannot.** The `@` autocomplete is a core Claude Code UI feature implemented in Rust. There are no plugin hooks or APIs to customize it. This would require changes to Claude Code itself by the Anthropic team. See [Critical Limitation](#critical-limitation-autocomplete-not-supported) above.

### Can I commit `.claudeignore` to git?

Yes! `.claudeignore` is meant to be project-specific and committed to version control. Your team can share the same Claude access patterns.

### What about `.git/info/exclude`?

`.git/info/exclude` is a local gitignore that's not committed. This plugin respects `.gitignore` (committed) behavior.

If files are in `.git/info/exclude`, they're still tracked by git and visible to Claude (unless blocked by `.claudeignore`).

### Why Node.js instead of Python?

- Claude Code requires Node.js 18+ anyway
- Community plugins use Node.js successfully
- `ignore` npm package is battle-tested (48M weekly downloads)
- Better integration with Claude Code's tooling

## Technical Details

### Architecture

```
.claudeignore Plugin
├── hooks/
│   ├── claudeignore-hook.js    # PreToolUse hook (filters tool access)
│   └── hooks.json              # Hook configuration
├── lib/
│   └── pattern-matcher.js      # Pattern loading and matching logic
├── examples/
│   ├── .claudeignore.example   # Un-ignore use case
│   └── .claudeignore.security  # Security use case
└── package.json                # Dependencies (ignore npm package)
```

### Hook Flow

1. Claude Code calls tool (Read/Edit/Write/Glob/Grep)
2. PreToolUse hook intercepts call
3. Quick check: does `.claudeignore` exist? If no → **exit 0 (allow)**
4. Load patterns from all `.claudeignore` files up to git root
5. Check if file path matches ignore patterns
6. If matched → **exit 2 (block)**, else → **exit 0 (allow)**

### Pattern Matching

Uses `ignore` npm package (v5.3.0):
- Gitignore spec 2.22.1 compliant
- Supports all standard gitignore features
- Optimized for performance
- Used by eslint, prettier, and major tools

### Session Caching

Cache stored in `~/.claude/claudeignore_cache_<session_id>.json`:

```json
{
  "gitRoot": "/path/to/project",
  "files": ["/path/to/project/.claudeignore"],
  "mtimes": [1705123456789],
  "patterns": "...",
  "timestamp": 1705123456789
}
```

Cache invalidation:
- File modification time change
- Different git root
- Session change
- 7-day automatic cleanup

## Contributing

This plugin is part of the Claude Code repository under `plugins/claudeignore/`.

See related GitHub issues:
- [#5105 - .claudeignore feature request](https://github.com/anthropics/claude-code/issues/5105)
- [#1248 - @-mention limitation for gitignored files](https://github.com/anthropics/claude-code/issues/1248)
- [#620 - Security concerns about .env files](https://github.com/anthropics/claude-code/issues/620)
- [#2637 - Security request for .claudeignore](https://github.com/anthropics/claude-code/issues/2637)

## Roadmap

### Phase 1 (Current) ✅
- [x] PreToolUse hook for Read/Edit/Write/MultiEdit/Glob/Grep
- [x] Gitignore syntax with negation patterns
- [x] Hierarchical .claudeignore discovery
- [x] Session-based caching
- [x] Zero-overhead optimization

### Phase 2 (Blocked - Requires Claude Code Changes)
- [ ] **@-mention autocomplete filtering** - BLOCKED: No plugin API exists. See [Feature Request](#feature-request-autocomplete-hook)
- [ ] VS Code extension integration
- [ ] Pattern testing CLI tool

## Feature Request: Autocomplete Hook

For this plugin to be useful for its primary purpose (un-ignoring gitignored files), Claude Code needs to provide one of:

1. **An autocomplete hook** - `PreAutocomplete` hook that plugins can use to filter/add files
2. **A `.claudeinclude` setting** - Per-project config to add specific gitignored files to autocomplete
3. **Negation support in `.ignore`** - Allow `!pattern` syntax to un-ignore specific files

See GitHub issue: [#5105 - Feature Request: Autocomplete customization for plugins](https://github.com/anthropics/claude-code/issues/5105)

**Without this, the "un-ignore gitignored files" use case is impractical** - users must manually type file paths instead of using `@` discovery.

## License

MIT

## Credits

- Inspired by [Cursor's `.cursorignore`](https://docs.cursor.com/context/ignore-files)
- Built with [`ignore` npm package](https://www.npmjs.com/package/ignore)
- Created for the Claude Code community

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/anthropics/claude-code/issues
- Label: `plugin:claudeignore`
