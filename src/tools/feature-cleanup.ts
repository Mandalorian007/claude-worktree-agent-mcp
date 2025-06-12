import simpleGit from 'simple-git';
import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';

interface FeatureCleanupArgs {
  featureName?: string;
  force?: boolean;
  all?: boolean;
}

export async function featureCleanup(args: FeatureCleanupArgs = {}) {
  const { featureName, force = false, all = false } = args;

  if (!fs.existsSync('.worktrees')) {
    return {
      content: [
        {
          type: 'text',
          text: '📂 No worktrees directory found - nothing to clean up',
        },
      ],
    };
  }

  const git = simpleGit();
  const worktrees = fs.readdirSync('.worktrees').filter((name: string) => {
    const worktreePath = path.join('.worktrees', name);
    return fs.statSync(worktreePath).isDirectory();
  });

  if (worktrees.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: '📂 No worktrees found - nothing to clean up',
        },
      ],
    };
  }

  let cleanupResults = '🧹 **Feature Cleanup**\n==================\n\n';
  let cleanedCount = 0;
  let skippedCount = 0;

  // Determine which worktrees to clean
  let targetWorktrees: string[];
  
  if (featureName) {
    // Clean specific feature
    if (worktrees.includes(featureName)) {
      targetWorktrees = [featureName];
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Feature '${featureName}' not found`,
          },
        ],
      };
    }
  } else if (all) {
    // Clean all features
    targetWorktrees = worktrees;
    cleanupResults += '⚠️ **Warning: Cleaning ALL features (including active ones)**\n\n';
  } else {
    // Clean only completed features (merged/closed PRs)
    targetWorktrees = worktrees;
    cleanupResults += 'Cleaning up completed features (merged/closed PRs)...\n\n';
  }

  // Clean up each target worktree
  for (const worktreeName of targetWorktrees) {
    const worktreePath = path.join('.worktrees', worktreeName);
    const branchName = `feature/${worktreeName}`;
    
    cleanupResults += `🧹 **${worktreeName}**\n`;

    try {
      let shouldClean = force || all;

      // Check PR status if not forcing
      if (!shouldClean) {
        try {
          process.chdir(worktreePath);
          const { stdout: prState } = await execa('gh', ['pr', 'view', '--json', 'state', '-q', '.state'], { stdio: 'pipe' });
          
          if (prState.trim() === 'MERGED') {
            cleanupResults += `   ✅ PR merged - safe to remove\n`;
            shouldClean = true;
          } else if (prState.trim() === 'CLOSED') {
            cleanupResults += `   ⚠️ PR closed - removing anyway\n`;
            shouldClean = true;
          } else if (prState.trim() === 'OPEN') {
            cleanupResults += `   ❌ PR still open - skipping (use force to override)\n`;
            skippedCount++;
          }
        } catch {
          // No PR found
          cleanupResults += `   ⚠️ No PR found - removing anyway\n`;
          shouldClean = true;
        } finally {
          try { process.chdir('../..'); } catch {}
        }
      }

      if (shouldClean) {
        // Remove worktree
        await git.raw(['worktree', 'remove', worktreePath, '--force']);
        cleanupResults += `   📂 Removed worktree: ${worktreePath}\n`;

        // Remove branch if it exists
        try {
          const branches = await git.branchLocal();
          if (branches.all.includes(branchName)) {
            await git.deleteLocalBranch(branchName, true);
            cleanupResults += `   🌿 Removed branch: ${branchName}\n`;
          }
        } catch {
          // Branch might not exist or already removed
        }

        cleanupResults += `   ✅ Cleanup complete\n`;
        cleanedCount++;
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      cleanupResults += `   ❌ Error during cleanup: ${errorMessage}\n`;
      skippedCount++;
    }

    cleanupResults += '\n';
  }

  // Add summary
  cleanupResults += '📊 **Summary:**\n';
  cleanupResults += `   Cleaned: ${cleanedCount}\n`;
  if (skippedCount > 0) {
    cleanupResults += `   Skipped: ${skippedCount} (active PRs or errors)\n`;
  }

  // Clean up empty worktrees directory
  if (fs.existsSync('.worktrees') && fs.readdirSync('.worktrees').length === 0) {
    fs.rmdirSync('.worktrees');
    cleanupResults += `   🗂️ Removed empty .worktrees directory\n`;
  }

  if (cleanedCount === 0 && skippedCount === 0) {
    cleanupResults += `   Nothing to clean up\n`;
  }

  return {
    content: [
      {
        type: 'text',
        text: cleanupResults,
      },
    ],
  };
}

export default featureCleanup; 