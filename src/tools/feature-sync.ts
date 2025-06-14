import simpleGit from 'simple-git';
import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';

interface FeatureSyncArgs {
  featureName: string;
}

export async function featureSync(args: FeatureSyncArgs) {
  const { featureName } = args;

  // Get project root directory - require PROJECT_ROOT env var for Cursor MCP
  const projectRoot = process.env.PROJECT_ROOT;
  if (!projectRoot) {
    throw new Error('PROJECT_ROOT environment variable not set. This is required for Cursor MCP. Add "env": {"PROJECT_ROOT": "/path/to/your/project"} to your MCP configuration.');
  }

  const worktreePath = path.join(projectRoot, '.worktrees', featureName);
  const branchName = `feature/${featureName}`;

  // Validate that the feature worktree exists
  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Feature '${featureName}' not found at '${worktreePath}'. Use feature_start to create it first.`);
  }

  const git = simpleGit(projectRoot);
  const worktreeGit = simpleGit(worktreePath);

  try {
    // Ensure we're in a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      throw new Error('Not in a git repository. Please run this command from your project root.');
    }

    let syncMessage = `🔄 Syncing feature '${featureName}' to main...\n\n`;

    // 1. Fetch latest main
    syncMessage += '📥 Fetching latest main...';
    await git.fetch('origin', 'main');
    
    // Get commit count for feedback
    const beforeLog = await git.log({ from: 'main', to: 'origin/main' });
    const newCommits = beforeLog.total;
    
    if (newCommits > 0) {
      syncMessage += ` (${newCommits} new commit${newCommits !== 1 ? 's' : ''})\n`;
    } else {
      syncMessage += ' (already up to date)\n';
    }

    // 2. Switch to the feature branch in worktree and check status
    await worktreeGit.checkout(branchName);
    const status = await worktreeGit.status();
    
    if (status.files.length > 0) {
      // Stash any uncommitted changes
      syncMessage += '💾 Stashing uncommitted changes...\n';
      await worktreeGit.stash(['push', '-m', 'Auto-stash before sync']);
    }

    // 3. Attempt rebase onto main
    syncMessage += '🔀 Rebasing feature branch onto main...\n';
    
    try {
      await worktreeGit.rebase(['origin/main']);
      syncMessage += '✅ Rebase completed successfully!\n';
      
      // Restore stashed changes if any
      if (status.files.length > 0) {
        try {
          await worktreeGit.stash(['pop']);
          syncMessage += '✅ Restored uncommitted changes\n';
        } catch {
          syncMessage += '⚠️  Some stashed changes may need manual resolution\n';
        }
      }
      
      // Check how many commits ahead of main
      const aheadLog = await worktreeGit.log({ from: 'origin/main', to: 'HEAD' });
      const commitsAhead = aheadLog.total;
      
      syncMessage += `\n✅ Feature synced successfully!\n`;
      if (commitsAhead > 0) {
        syncMessage += `Your branch is now ${commitsAhead} commit${commitsAhead !== 1 ? 's' : ''} ahead of main.\n`;
      }
      
    } catch (error) {
      // Rebase failed, likely due to conflicts
      syncMessage += '⚠️  Conflicts detected during rebase\n';
      
      // Get conflicted files
      const conflictedFiles: string[] = [];
      try {
        const statusAfterConflict = await worktreeGit.status();
        conflictedFiles.push(...statusAfterConflict.conflicted);
      } catch {
        // Fallback: try to parse git status output
        try {
          const { stdout } = await execa('git', ['status', '--porcelain'], { cwd: worktreePath });
          const lines = stdout.split('\n');
          for (const line of lines) {
            if (line.startsWith('UU ') || line.startsWith('AA ') || line.startsWith('DD ')) {
              conflictedFiles.push(line.substring(3));
            }
          }
        } catch {
          // Unable to determine conflicted files
        }
      }

      if (conflictedFiles.length > 0) {
        syncMessage += `📋 Conflicts in: ${conflictedFiles.join(', ')}\n`;
        syncMessage += '🤖 Launching Claude Code for conflict resolution...\n';
        
        // Launch Claude Code for conflict resolution
        const resolveResult = await resolveConflictsWithClaude(worktreePath, conflictedFiles, featureName);
        syncMessage += resolveResult.message;
        
        if (resolveResult.success) {
          syncMessage += '\n✅ Feature synced successfully after conflict resolution!\n';
          
          // Check commits ahead again after resolution
          const aheadLog = await worktreeGit.log({ from: 'origin/main', to: 'HEAD' });
          const commitsAhead = aheadLog.total;
          if (commitsAhead > 0) {
            syncMessage += `Your branch is now ${commitsAhead} commit${commitsAhead !== 1 ? 's' : ''} ahead of main.\n`;
          }
        } else {
          syncMessage += '\n❌ Manual intervention required. See conflict details above.\n';
        }
      } else {
        // Unknown conflict type
        syncMessage += '❌ Rebase failed with unknown conflicts\n';
        syncMessage += '📋 Run `git status` in the worktree to diagnose the issue\n';
        throw new Error('Rebase failed with conflicts that could not be automatically resolved');
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: syncMessage,
        },
      ],
    };

  } catch (error: unknown) {
    // Try to abort rebase if it's in progress
    try {
      await worktreeGit.rebase(['--abort']);
    } catch {
      // Ignore abort errors
    }
    
    throw error;
  }
}

async function resolveConflictsWithClaude(
  worktreePath: string, 
  conflictedFiles: string[], 
  featureName: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Create conflict analysis file
    const conflictAnalysis = await generateConflictAnalysis(worktreePath, conflictedFiles);
    const conflictFilePath = path.join(worktreePath, 'CONFLICTS.md');
    fs.writeFileSync(conflictFilePath, conflictAnalysis);

    // Create resolution instructions for Claude Code
    const instructions = `I need you to resolve git merge conflicts prioritizing main branch changes.

## Conflict Resolution Task

You are resolving conflicts from a rebase of feature branch '${featureName}' onto main.

**Strategy: Main-first approach**
- When in doubt, prefer changes from main branch (incoming changes)
- Only keep feature changes when they are clearly additive or fix specific issues
- Remove any duplicate or redundant code

## Conflicts to Resolve

The following files have conflicts:
${conflictedFiles.map(file => `- ${file}`).join('\n')}

## Your Process

1. **Read CONFLICTS.md** - Contains detailed conflict analysis
2. **Examine each conflicted file** - Look for conflict markers (<<<<<<< HEAD, =======, >>>>>>> main)
3. **Resolve systematically** - Apply main-first strategy while preserving feature value
4. **Test the resolution** - Ensure the code still works after resolution
5. **Commit the resolution** - Use: \`git add .\` then \`git rebase --continue\`

## Success Criteria

- All conflict markers removed
- Code compiles and runs
- Feature functionality preserved where appropriate
- Main branch integrity maintained

Start by reading CONFLICTS.md to understand the conflicts, then systematically resolve each file.`;

    // Launch Claude Code with conflict resolution task
    const claudeCommand = process.env.CLAUDE_COMMAND || 'claude';
    const claudeArgs = process.env.CLAUDE_ARGS ? process.env.CLAUDE_ARGS.split(' ') : ['--dangerously-skip-permissions'];
    
    const { stdout, stderr } = await execa(claudeCommand, claudeArgs, {
      input: instructions,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: worktreePath,
      timeout: 300000, // 5 minute timeout
    });

    // Check if conflicts were resolved
    const worktreeGit = simpleGit(worktreePath);
    const status = await worktreeGit.status();
    
    if (status.conflicted.length === 0) {
      return {
        success: true,
        message: '✅ Claude Code resolved conflicts (main-first strategy)\n'
      };
    } else {
      // Clean up conflict file and provide manual intervention guidance
      try {
        fs.unlinkSync(conflictFilePath);
      } catch {
        // Ignore cleanup errors
      }
      
      return {
        success: false,
        message: `❌ Claude Code could not complete conflict resolution\n📋 Conflict details saved to ${conflictFilePath}\n\nNext steps: Review conflicts manually, then run feature_sync again\n`
      };
    }

  } catch (error) {
    // Claude Code execution failed
    const conflictFilePath = path.join(worktreePath, 'CONFLICTS.md');
    
    return {
      success: false,
      message: `❌ Claude Code could not complete conflict resolution\n📋 Conflict details saved to ${conflictFilePath}\n\nNext steps: Review conflicts manually, then run feature_sync again\n`
    };
  }
}

async function generateConflictAnalysis(worktreePath: string, conflictedFiles: string[]): Promise<string> {
  let analysis = `# Conflict Analysis for Feature Sync

## Overview
This file contains analysis of merge conflicts encountered during feature sync.

## Conflicted Files
${conflictedFiles.map(file => `- ${file}`).join('\n')}

## Conflict Details

`;

  for (const file of conflictedFiles) {
    const filePath = path.join(worktreePath, file);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        analysis += `### ${file}\n\n`;
        
        // Extract conflict sections
        const lines = content.split('\n');
        let inConflict = false;
        let conflictCount = 0;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('<<<<<<<')) {
            inConflict = true;
            conflictCount++;
            analysis += `**Conflict ${conflictCount}** (lines ${i + 1}-?):\n\`\`\`\n`;
          }
          
          if (inConflict) {
            analysis += line + '\n';
          }
          
          if (line.startsWith('>>>>>>>')) {
            inConflict = false;
            analysis += `\`\`\`\n\n`;
          }
        }
        
        if (conflictCount === 0) {
          analysis += 'No conflict markers found in file (may be a binary conflict or deletion conflict).\n\n';
        }
      } else {
        analysis += `### ${file}\n\nFile not found (may be a deletion conflict).\n\n`;
      }
    } catch (error) {
      analysis += `### ${file}\n\nError reading file: ${error}\n\n`;
    }
  }

  analysis += `## Resolution Strategy

**Main-first approach:**
1. When in doubt, prefer main branch changes (incoming)
2. Only keep feature changes that are clearly additive
3. Remove duplicate or redundant code
4. Ensure code quality and consistency

## Next Steps

1. Examine each conflict carefully
2. Apply resolution strategy consistently
3. Test the resolved code
4. Commit with \`git add . && git rebase --continue\`
`;

  return analysis;
}

export default featureSync;