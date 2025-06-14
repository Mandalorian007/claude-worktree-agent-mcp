# Feature Sync Tool

## Core Use Case
You're working on a feature branch and want to sync it with the latest main. One command, automatic conflict resolution, done.

## Tool: `feature_sync`

```typescript
interface FeatureSyncArgs {
  featureName: string;
}
```

## Simple Workflow

```bash
# Sync a specific feature to main
mcp_worktree-agent_feature_sync --featureName user-dashboard
```

## What It Does

1. **Fetch latest main**
2. **Rebase feature onto main**
3. **AI resolves conflicts (main wins on ambiguity)**
4. **Done**

## Example Output

```
🔄 Syncing feature 'user-dashboard' to main...
📥 Fetching latest main (3 new commits)
🔀 Rebasing user-dashboard onto main...
⚠️  3 conflicts detected in src/components/Dashboard.tsx
🤖 Launching Claude Code for conflict resolution...
✅ Claude Code resolved conflicts (main-first strategy)
✅ Feature synced successfully!

Your branch is now 3 commits ahead of main.
```

## Claude Code Integration

When conflicts are detected:

1. **Conflict Analysis**: Generate context for Claude Code about the conflicts
2. **Instructions**: Provide clear guidance: "Resolve conflicts prioritizing main branch changes"  
3. **Autonomous Resolution**: Claude Code analyzes, understands, and resolves conflicts
4. **Validation**: Commits resolved changes with clear messages

## When Manual Intervention Needed

```
⚠️  Conflicts detected in src/components/Dashboard.tsx
🤖 Claude Code could not complete conflict resolution
📋 Conflict details saved to .worktrees/user-dashboard/CONFLICTS.md

Next steps: Review conflicts manually, then run feature_sync again
```

## Implementation

### Git Operations
- Fetch latest main commits
- Attempt rebase of feature branch onto main 

### Conflict Resolution (Claude Code)
- **Detect conflicts**: Parse git status for conflicted files
- **Generate context**: Create conflict analysis and resolution instructions
- **Launch Claude Code**: Send task with main-first priority guidance
- **Autonomous resolution**: Claude Code understands conflicts and resolves intelligently
- **Continue rebase**: Complete git operations after resolution

### Error Handling
- Clear status messages throughout process
- Graceful fallback when Claude Code can't resolve
- Detailed conflict summary for manual intervention

## Why This Design?

1. **Zero friction** - Just specify the feature name
2. **Main-first** - Prioritizes main to prevent regressions
3. **Safe** - Simple rebase strategy, clear error messages
4. **Consistent** - Matches existing tool interface patterns
5. **Focused** - Does one thing well

## Real Usage Pattern

```bash
# Keep your feature current with main
mcp_worktree-agent_feature_sync --featureName user-dashboard

# Before creating PR
mcp_worktree-agent_feature_sync --featureName user-dashboard
gh pr create
```

One command to sync your feature with main. Main wins conflicts. Done. 