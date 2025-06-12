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

  // Get project root directory - require PROJECT_ROOT env var for Cursor MCP
  const projectRoot = process.env.PROJECT_ROOT;
  if (!projectRoot) {
    throw new Error('PROJECT_ROOT environment variable not set. This is required for Cursor MCP. Add "env": {"PROJECT_ROOT": "/path/to/your/project"} to your MCP configuration.');
  }

  const worktreesPath = path.join(projectRoot, '.worktrees');

  if (!fs.existsSync(worktreesPath)) {
    return {
      content: [
        {
          type: 'text',
          text: '📂 No worktrees found to clean up',
        },
      ],
    };
  }

  const git = simpleGit(projectRoot);
  
  // Get list of worktrees to clean
  const allWorktrees = fs.readdirSync(worktreesPath).filter(dir => 
    fs.statSync(path.join(worktreesPath, dir)).isDirectory()
  );

  let targetWorktrees: string[];
  if (featureName) {
    // Clean specific feature
    if (!allWorktrees.includes(featureName)) {
      throw new Error(`Feature '${featureName}' not found`);
    }
    targetWorktrees = [featureName];
  } else if (all) {
    // Clean all features (dangerous)
    targetWorktrees = allWorktrees;
  } else {
    // Default: clean only merged/closed features
    targetWorktrees = allWorktrees;
  }

  if (targetWorktrees.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: '🧹 No features to clean up',
        },
      ],
    };
  }

  let cleanupResults = `🧹 **Feature Cleanup Results**\n\n`;
  let cleanedCount = 0;
  let skippedCount = 0;

  // Clean up each target worktree
  for (const worktreeName of targetWorktrees) {
    const worktreePath = path.join(worktreesPath, worktreeName);
    const branchName = `feature/${worktreeName}`;
    
    cleanupResults += `🧹 **${worktreeName}**\n`;

    try {
      let shouldClean = force || all;

      // Check PR status if not forcing
      if (!shouldClean) {
        try {
          const { stdout: prState } = await execa('gh', ['pr', 'view', '--json', 'state', '-q', '.state'], { 
            stdio: 'pipe',
            cwd: worktreePath
          });
          
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
  if (fs.existsSync(worktreesPath) && fs.readdirSync(worktreesPath).length === 0) {
    fs.rmdirSync(worktreesPath);
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