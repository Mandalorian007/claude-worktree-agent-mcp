#!/bin/bash

# Feature Cleanup Script
# Usage: ./cleanup-feature.sh <feature-name>

# Don't exit on errors - we want to attempt all cleanup steps
set +e

# Check if feature name is provided
if [ $# -eq 0 ]; then
    echo "❌ Usage: $0 <feature-name>"
    echo "   Example: $0 feature-sync-tool"
    echo ""
    echo "🔍 Available features:"
    if [ -d ".worktrees" ]; then
        ls -1 .worktrees/ 2>/dev/null || echo "   (none)"
    else
        echo "   (none)"
    fi
    exit 1
fi

FEATURE_NAME="$1"
BRANCH_NAME="feature/$FEATURE_NAME"
WORKTREE_PATH=".worktrees/$FEATURE_NAME"

echo "🧹 Cleaning up feature: $FEATURE_NAME"
echo "🌿 Branch: $BRANCH_NAME"
echo "📁 Worktree: $WORKTREE_PATH"
echo ""

CLEANUP_SUCCESS=true

# Step 1: Kill any running Claude Code processes
echo "🔍 Checking for running Claude Code processes..."
claude_pids=$(ps aux | grep "claude.*--dangerously-skip-permissions" | grep -v grep | awk '{print $2}' || true)
if [ -n "$claude_pids" ]; then
    echo "🛑 Stopping Claude Code processes: $claude_pids"
    echo "$claude_pids" | xargs kill 2>/dev/null || true
    sleep 2
    # Force kill if still running
    still_running=$(ps aux | grep "claude.*--dangerously-skip-permissions" | grep -v grep | awk '{print $2}' || true)
    if [ -n "$still_running" ]; then
        echo "🛑 Force stopping stubborn processes: $still_running"
        echo "$still_running" | xargs kill -9 2>/dev/null || true
    fi
    echo "✅ Claude Code processes stopped"
else
    echo "   (none running)"
fi

# Step 2: Remove worktree (handles both directory and git worktree list)
echo ""
echo "🗑️  Removing worktree..."
if [ -d "$WORKTREE_PATH" ]; then
    # Try git worktree remove first
    if git worktree remove "$WORKTREE_PATH" --force 2>/dev/null; then
        echo "✅ Git worktree removed successfully"
    else
        echo "⚠️  Git worktree remove failed, attempting manual cleanup..."
        # Manual cleanup if git command fails
        rm -rf "$WORKTREE_PATH" 2>/dev/null || true
        # Clean up git worktree list manually
        git worktree prune 2>/dev/null || true
        echo "✅ Manual worktree cleanup completed"
    fi
else
    echo "   Worktree directory doesn't exist"
    # Still try to clean up git worktree list in case it's orphaned
    git worktree prune 2>/dev/null || true
fi

# Step 3: Handle current branch if checked out in main worktree
echo ""
current_branch=$(git branch --show-current 2>/dev/null || echo "main")
if [ "$current_branch" = "$BRANCH_NAME" ]; then
    echo "🔄 Switching from feature branch to main..."
    git checkout main 2>/dev/null || git checkout master 2>/dev/null || true
fi

# Step 4: Remove branch (handle both local and tracking)
echo "🗑️  Removing branch..."
if git show-ref --verify --quiet refs/heads/$BRANCH_NAME 2>/dev/null; then
    if git branch -D "$BRANCH_NAME" 2>/dev/null; then
        echo "✅ Local branch removed"
    else
        echo "⚠️  Failed to remove local branch (may be checked out elsewhere)"
        CLEANUP_SUCCESS=false
    fi
else
    echo "   Local branch doesn't exist"
fi

# Also check for and remove any remote tracking branches
if git show-ref --verify --quiet refs/remotes/origin/$BRANCH_NAME 2>/dev/null; then
    echo "🗑️  Removing remote tracking branch..."
    git branch -Dr origin/$BRANCH_NAME 2>/dev/null || echo "⚠️  Failed to remove remote tracking branch"
fi

# Step 5: Clean up empty directories
echo ""
echo "🧹 Cleaning up directories..."
if [ -d ".worktrees" ]; then
    if [ -z "$(ls -A .worktrees 2>/dev/null)" ]; then
        echo "🗑️  Removing empty .worktrees directory..."
        rmdir .worktrees 2>/dev/null || echo "⚠️  Failed to remove .worktrees directory"
    else
        echo "   .worktrees directory has other features, keeping it"
    fi
else
    echo "   .worktrees directory doesn't exist"
fi

# Final status
echo ""
if [ "$CLEANUP_SUCCESS" = true ]; then
    echo "🎉 Cleanup completed successfully!"
else
    echo "⚠️  Cleanup completed with some warnings (see messages above)"
fi

echo ""
echo "📊 Run './scripts/status-features.sh' to verify cleanup" 