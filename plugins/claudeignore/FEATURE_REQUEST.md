# Feature Request: Autocomplete Hook or Per-Project File Include

## Summary

Claude Code needs a way for plugins (or per-project configuration) to customize which files appear in `@` autocomplete. Currently, the autocomplete only respects `.gitignore` with no way to un-ignore specific files per project.

## The Problem

Many developers have files that are gitignored for valid reasons (not committed to version control) but are useful context for Claude:

- `tasks/` - Personal task tracking
- `journal/` - Development notes
- `docs/private/` - Local documentation
- `.env.example` - Environment variable templates
- `TODO.md`, `NOTES.md` - Project notes

**These files are invisible to Claude Code's `@` autocomplete**, making it impractical to reference them.

## Current "Solution" is Inadequate

The [official workaround](https://github.com/anthropics/claude-code/issues/5105) (v2.0.27+) requires:

1. **Disable "Respect .gitignore in file picker"** globally in `/config`
2. **Create a `.ignore` file** in every project to re-block sensitive files

### Why This Doesn't Work in Practice

| Issue | Impact |
|-------|--------|
| **Security risk** | ALL gitignored files become visible by default, including `.env`, credentials, API keys |
| **Backwards model** | Must opt-out to protect files instead of opt-in to expose them |
| **Per-project overhead** | Every project needs a `.ignore` file to block sensitive files |
| **No selective un-ignore** | `.ignore` only blocks files - you can't say "show only `tasks/` from gitignored files" |
| **Global setting** | Affects all projects, not just the one where you need specific files |

### Real-World Example

I have a personal knowledge base repo with:
```
.gitignore:
  tasks/
  journal/
  me/private/
  work/
  personal/
```

These are gitignored because they're personal/private and shouldn't be in version control. But I want Claude to help me with these files.

**With the current solution:**
1. I must disable gitignore globally (exposing `.env` in ALL my projects)
2. I must create `.ignore` files in every other project to re-protect sensitive files
3. I still can't selectively expose just `tasks/` - it's all or nothing

**What I actually want:**
```
.claudeinclude (or .claudeignore with negation):
  !tasks/
  !journal/
```

This would expose only specific directories in this one project, without affecting global settings or other projects.

## Plugin Attempt: claudeignore

I built a [claudeignore plugin](./README.md) to solve this using PreToolUse hooks. The plugin:

- ✅ Successfully filters tool access (Read/Write/Edit/Glob/Grep)
- ✅ Uses gitignore syntax with negation patterns (`!tasks/`)
- ✅ Works per-project with zero overhead

**But it cannot affect `@` autocomplete** because:
- Autocomplete is implemented in Claude Code's core Rust fuzzy finder
- No plugin hooks exist for autocomplete customization
- No settings control autocomplete behavior

This makes the plugin impractical - users can't discover files with `@`, they must manually type paths.

## Proposed Solutions

Any of these would solve the problem:

### Option 1: Autocomplete Hook (Most Flexible)

Add a `PreAutocomplete` hook that plugins can use:

```json
{
  "hooks": {
    "PreAutocomplete": [{
      "matcher": ".*",
      "hooks": [{
        "type": "command",
        "command": "node autocomplete-filter.js"
      }]
    }]
  }
}
```

Input: `{ "query": "tasks", "files": [...] }`
Output: Modified file list or additional files to include

### Option 2: Per-Project Include Setting (Simplest)

Add `includeGitIgnored` to `.claude/settings.json`:

```json
{
  "includeGitIgnored": [
    "tasks/",
    "journal/",
    "docs/private/"
  ]
}
```

These patterns would be added to autocomplete even if gitignored.

### Option 3: Negation Support in .ignore

Allow `.ignore` to use negation patterns:

```gitignore
# Block sensitive files
.env
credentials.json

# But show these gitignored directories
!tasks/
!journal/
```

This would make `.ignore` work like proper gitignore syntax.

### Option 4: .claudeinclude File

A dedicated file for files to include:

```
# .claudeinclude
tasks/
journal/
docs/private/
*.example
```

## Why This Matters

1. **Security**: The current "disable gitignore globally" approach is a security anti-pattern
2. **Usability**: Many legitimate use cases require gitignored files as context
3. **Consistency**: Cursor has `.cursorignore` with negation support - Claude Code should match
4. **Plugin ecosystem**: Plugins can't extend Claude Code in useful ways without autocomplete hooks

## Related Issues

- [#5105 - Allow Claude Code to access gitignored files](https://github.com/anthropics/claude-code/issues/5105) - 106+ upvotes
- [#1248 - @-mention limitation for gitignored files](https://github.com/anthropics/claude-code/issues/1248)
- [#2637 - Security request for .claudeignore](https://github.com/anthropics/claude-code/issues/2637)
- [#620 - Security concerns about .env files](https://github.com/anthropics/claude-code/issues/620)

## Implementation Notes

The claudeignore plugin in this repository demonstrates:
- Pattern matching with the `ignore` npm package (gitignore spec compliant)
- Per-project activation (zero overhead when not used)
- Hierarchical file discovery
- Session caching for performance

This code could be adapted for a core Claude Code implementation.

---

**Without this feature, the plugin ecosystem cannot solve common developer workflow problems, and the official workaround creates security risks.**
