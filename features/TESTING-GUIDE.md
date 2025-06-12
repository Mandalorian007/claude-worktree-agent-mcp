# Claude Worktree Agent Testing Guide

## Overview
This guide details what each tool in the Claude Worktree Agent does, what prerequisites they need, and what aspects can be tested safely.

## Tool Analysis & Testing Strategy

### 1. `feature_start` - Start Feature Development

#### **What it does:**
- Creates a new git branch (e.g., `feature/user-dashboard`)
- Creates an isolated git worktree in `.worktrees/[feature-name]/`
- Copies essential project files (package.json, tsconfig.json, src/, etc.)
- Installs dependencies in the worktree
- Copies feature specification to `FEATURE.md` in worktree
- Starts Claude Code development session

#### **Prerequisites:**
- ✅ Valid git repository
- ✅ Feature specification file (`.md` format)
- ✅ PROJECT_ROOT environment variable set
- ⚠️ Claude Code installed (for full functionality)

#### **What can be tested safely:**
- ✅ **Feature file validation** - Checks if feature file exists
- ✅ **Git repository validation** - Ensures we're in a git repo
- ✅ **Branch creation** - Creates new feature branch
- ✅ **Worktree creation** - Creates isolated development directory
- ✅ **File copying** - Copies project files to worktree
- ✅ **Dependency installation** - Runs npm/pnpm install in worktree
- ⚠️ **Claude Code execution** - Will attempt to start Claude (may fail gracefully)

#### **Expected outputs:**
- New branch: `feature/user-dashboard`
- New directory: `.worktrees/user-dashboard/`
- Copied files: package.json, src/, tsconfig.json, etc.
- Feature spec copied to worktree as `FEATURE.md`

---

### 2. `feature_status` - Check Development Status

#### **What it does:**
- Scans `.worktrees/` directory for active features
- Checks git branch status and commits
- Shows recent commit information
- Checks for existing Pull Requests via GitHub CLI
- Detects if Claude Code is currently running
- Reports working tree status (clean/modified files)

#### **Prerequisites:**
- ✅ Existing worktrees (created by `feature_start`)
- ✅ GitHub CLI installed and authenticated
- ✅ PROJECT_ROOT environment variable set

#### **What can be tested safely:**
- ✅ **Directory scanning** - Lists all active features
- ✅ **Branch status** - Shows if branches exist
- ✅ **Commit information** - Shows recent commits
- ✅ **Git status** - Reports modified/clean working tree
- ✅ **PR detection** - Checks for existing GitHub PRs
- ✅ **Process detection** - Checks if Claude is running

#### **Expected outputs:**
```
📂 **Active Feature Development**

🔨 **user-dashboard**
   Path: /path/to/.worktrees/user-dashboard
   Branch: ✅ feature/user-dashboard
   Latest: abc1234 Initial feature setup
   Status: Working tree clean
   PR: 📤 Not pushed to remote yet
   Claude: 💤 Not running
```

---

### 3. `feature_cleanup` - Clean Up Features

#### **What it does:**
- Lists all existing worktrees
- Checks PR status (MERGED, CLOSED, OPEN) via GitHub CLI
- Safely removes completed features (merged/closed PRs)
- Removes git worktrees and feature branches
- Skips active features unless forced
- Cleans up empty `.worktrees` directory

#### **Prerequisites:**
- ✅ Existing worktrees to clean up
- ✅ GitHub CLI installed and authenticated (for PR checking)
- ✅ PROJECT_ROOT environment variable set

#### **What can be tested safely:**
- ✅ **Worktree scanning** - Lists features available for cleanup
- ✅ **PR status checking** - Checks GitHub PR state
- ✅ **Safe removal logic** - Only removes completed features
- ✅ **Worktree removal** - Removes git worktrees
- ✅ **Branch deletion** - Removes feature branches
- ⚠️ **Force cleanup** - Can remove active features (use carefully)

#### **Test scenarios:**
- **No worktrees**: Should report nothing to clean
- **Active feature**: Should skip unless forced
- **Completed feature**: Should remove safely
- **Force cleanup**: Should remove regardless of status

---

### 4. `feature_revision` - Apply Revisions

#### **What it does:**
- Validates feature and worktree exist
- Fetches ALL PR feedback (comments, reviews, inline comments)
- Analyzes current vs original feature specifications
- Generates comprehensive revision instructions
- Provides AI-driven analysis guidance for Claude
- Starts Claude Code for intelligent revision work

#### **Prerequisites:**
- ✅ Existing feature with worktree (from `feature_start`)
- ✅ GitHub CLI authenticated (for PR feedback)
- ✅ Feature specification file
- ⚠️ Existing PR (for feedback analysis)
- ⚠️ Claude Code installed (for revisions)

#### **What can be tested safely:**
- ✅ **Feature validation** - Checks feature and worktree exist
- ✅ **PR feedback collection** - Fetches GitHub comments/reviews
- ✅ **Specification comparison** - Compares current vs original specs
- ✅ **Revision instructions generation** - Creates `REVISION.md`
- ✅ **Git status analysis** - Shows current implementation status
- ⚠️ **Claude Code execution** - Will attempt to start Claude

#### **Expected outputs:**
- `REVISION.md` file with comprehensive instructions
- Analysis of PR feedback (if PR exists)
- Comparison of feature specifications
- Smart analysis instructions for Claude

---

## Testing Sequence

### Phase 1: Basic Functionality Tests
1. ✅ **Verify Setup** - Confirm all prerequisites
2. ✅ **Feature Start** - Test worktree creation
3. ✅ **Feature Status** - Check status reporting
4. ✅ **Feature Cleanup** - Test safe removal

### Phase 2: Advanced Workflow Tests
1. **Multiple Features** - Test with multiple concurrent features
2. **PR Integration** - Test with actual GitHub PRs
3. **Revision Workflow** - Test revision with PR feedback
4. **Error Handling** - Test edge cases and error scenarios

### Phase 3: Integration Tests
1. **Full Workflow** - Complete feature lifecycle
2. **Claude Integration** - Test with actual Claude Code (if available)
3. **GitHub Integration** - Test PR creation and management

## Safety Notes

### Safe to test:
- ✅ All git operations (branches, worktrees are isolated)
- ✅ File operations (only affects `.worktrees/` directory)
- ✅ GitHub CLI operations (read-only operations)
- ✅ Status and validation checks

### Test with caution:
- ⚠️ Claude Code execution (may start actual development sessions)
- ⚠️ Force cleanup operations (can remove active work)
- ⚠️ PR creation (creates actual GitHub PRs)

### Test environment setup:
```bash
# Clean slate for testing
rm -rf .worktrees/  # Remove any existing worktrees
git branch | grep "feature/" | xargs -n 1 git branch -D  # Clean feature branches
```

## Test Feature File
- **Location**: `features/user-dashboard.md`
- **Purpose**: Comprehensive feature specification for testing
- **Contents**: Realistic web development requirements with TypeScript, React, API integration
- **Benefits**: Tests real-world scenarios without being overly complex

This feature file provides:
- Clear requirements and acceptance criteria
- Technical specifications (TypeScript, React, APIs)
- File structure guidance
- Testing requirements
- Performance considerations
- Future enhancement ideas

Perfect for testing the complete worktree agent workflow! 