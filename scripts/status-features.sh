#!/bin/bash

# Feature Status Script
# Shows active worktrees and Claude Code processes

echo "📊 Feature Development Status"
echo "=============================="

# Show git worktrees
echo ""
echo "🌿 Git Worktrees:"
git worktree list

# Show active features
echo ""
echo "📁 Active Features:"
if [ -d ".worktrees" ] && [ "$(ls -A .worktrees 2>/dev/null)" ]; then
    for feature in .worktrees/*/; do
        if [ -d "$feature" ]; then
            feature_name=$(basename "$feature")
            branch_name="feature/$feature_name"
            
            echo "  🔧 $feature_name"
            echo "     📂 Path: $feature"
            echo "     🌿 Branch: $branch_name"
            
            # Check if there are uncommitted changes
            cd "$feature"
            if ! git diff-index --quiet HEAD -- 2>/dev/null; then
                echo "     📝 Status: Has uncommitted changes"
            elif [ -n "$(git status --porcelain 2>/dev/null)" ]; then
                echo "     📝 Status: Has untracked files"
            else
                echo "     ✅ Status: Clean working tree"
            fi
            
            # Check Claude configuration
            if [ -d ".claude" ]; then
                echo "     🤖 Claude: Configuration present"
            else
                echo "     ⚠️  Claude: No configuration (limited permissions)"
            fi
            cd - >/dev/null
            echo ""
        fi
    done
else
    echo "  (none)"
fi

# Show running Claude Code processes
echo ""
echo "🤖 Claude Code Processes:"
claude_processes=$(ps aux | grep "claude.*FEATURE\.md" | grep -v grep || true)
if [ -n "$claude_processes" ]; then
    echo "$claude_processes" | while read -r line; do
        pid=$(echo "$line" | awk '{print $2}')
        etime=$(ps -p "$pid" -o etime= 2>/dev/null | tr -d ' ' || echo "unknown")
        echo "  🏃 PID: $pid (running for: $etime)"
    done
else
    echo "  (none running)"
fi

echo ""
echo "💡 Commands:"
echo "   Start feature: ./scripts/start-feature.sh <feature-file.md>"
echo "   Clean feature: ./scripts/cleanup-feature.sh <feature-name>"
echo "   Show status:   ./scripts/status-features.sh" 