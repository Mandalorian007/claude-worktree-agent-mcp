import simpleGit from 'simple-git';
import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';

interface FeatureStatusArgs {
  featureName?: string;
}

export async function featureStatus(args: FeatureStatusArgs = {}) {
  const { featureName } = args;

  if (!fs.existsSync('.worktrees')) {
    return {
      content: [
        {
          type: 'text',
          text: '📂 No active feature development found (.worktrees directory missing)',
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
          text: '📂 No active feature development found',
        },
      ],
    };
  }

  // Filter by specific feature if requested
  const targetWorktrees = featureName 
    ? worktrees.filter((name: string) => name === featureName)
    : worktrees;

  if (featureName && targetWorktrees.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Feature '${featureName}' not found`,
        },
      ],
    };
  }

  let statusText = '🔍 **Feature Development Status**\n==============================\n\n';

  for (const worktreeName of targetWorktrees) {
    const worktreePath = path.join('.worktrees', worktreeName);
    const branchName = `feature/${worktreeName}`;
    
    statusText += `📁 **${worktreeName}**\n`;
    statusText += `   Path: ${worktreePath}\n`;
    statusText += `   Branch: ${branchName}\n`;

    try {
      // Check if branch exists
      const branches = await git.branchLocal();
      if (branches.all.includes(branchName)) {
        // Change to worktree directory to check status
        const worktreeGit = simpleGit(worktreePath);
        
        // Check git status
        const status = await worktreeGit.status();
        if (status.files.length > 0) {
          statusText += `   Status: 🟡 Working (${status.files.length} files changed)\n`;
          // Show first 3 files
          status.files.slice(0, 3).forEach((file: any) => {
            statusText += `     ${file.index || file.working_dir || '?'} ${file.path}\n`;
          });
          if (status.files.length > 3) {
            statusText += `     ... and ${status.files.length - 3} more files\n`;
          }
        } else {
          statusText += `   Status: ✅ Clean working directory\n`;
        }

        // Check for commits
        try {
          const log = await worktreeGit.log({ from: 'main', to: 'HEAD' });
          if (log.total > 0) {
            statusText += `   Commits: ${log.total} ahead of main\n`;
            // Show first 2 commits
            log.all.slice(0, 2).forEach((commit: any) => {
              statusText += `     ${commit.hash.substring(0, 7)} ${commit.message}\n`;
            });
            if (log.total > 2) {
              statusText += `     ... and ${log.total - 2} more commits\n`;
            }
          } else {
            statusText += `   Commits: No commits yet\n`;
          }
        } catch {
          statusText += `   Commits: Unable to check\n`;
        }

        // Check for PR (using gh CLI)
        try {
          process.chdir(worktreePath);
          const { stdout: prUrl } = await execa('gh', ['pr', 'view', '--json', 'url', '-q', '.url'], { stdio: 'pipe' });
          if (prUrl.trim()) {
            const { stdout: prState } = await execa('gh', ['pr', 'view', '--json', 'state', '-q', '.state'], { stdio: 'pipe' });
            statusText += `   PR: 🔗 ${prState.trim()} - ${prUrl.trim()}\n`;
          }
        } catch {
          // Check if branch is pushed
          try {
            await git.listRemote(['--heads', 'origin', branchName]);
            statusText += `   PR: ⏳ Branch pushed, no PR created yet\n`;
          } catch {
            statusText += `   PR: 📤 Not pushed to remote yet\n`;
          }
        } finally {
          try { process.chdir('../..'); } catch {}
        }

        // Check if Claude is running (basic process check)
        try {
          await execa('pgrep', ['-f', `claude.*${worktreePath.replace('./', '')}`], { stdio: 'pipe' });
          statusText += `   Claude: 🤖 Running\n`;
        } catch {
          statusText += `   Claude: 💤 Not running\n`;
        }

      } else {
        statusText += `   Status: ❌ Branch not found\n`;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      statusText += `   Status: ❌ Error checking status: ${errorMessage}\n`;
    }

    statusText += '\n';
  }

  if (!featureName) {
    statusText += '💡 **Tips:**\n';
    statusText += '   • Use `feature_cleanup` to remove completed features\n';
    statusText += '   • Use `feature_status` with featureName to check specific feature\n';
    statusText += '   • Visit worktree directories to manually check on progress\n';
  }

  return {
    content: [
      {
        type: 'text',
        text: statusText,
      },
    ],
  };
}

export default featureStatus; 