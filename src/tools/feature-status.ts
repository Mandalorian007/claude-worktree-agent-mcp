import simpleGit from 'simple-git';
import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';

interface FeatureStatusArgs {
  featureName?: string;
}

export async function featureStatus(args: FeatureStatusArgs = {}) {
  const { featureName } = args;

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
          text: '📂 No active feature development found (.worktrees directory missing)',
        },
      ],
    };
  }

  const git = simpleGit(projectRoot);
  let statusText = '📂 **Active Feature Development**\n\n';

  // Get target features to check
  const targetFeatures = featureName 
    ? [featureName] 
    : fs.readdirSync(worktreesPath).filter(dir => 
        fs.statSync(path.join(worktreesPath, dir)).isDirectory()
      );

  if (targetFeatures.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: featureName 
            ? `📂 Feature '${featureName}' not found`
            : '📂 No active features found',
        },
      ],
    };
  }

  for (const feature of targetFeatures) {
    const worktreePath = path.join(worktreesPath, feature);
    const branchName = `feature/${feature}`;
    
    statusText += `🔨 **${feature}**\n`;
    statusText += `   Path: ${worktreePath}\n`;

    try {
      // Check if branch exists
      const branches = await git.branchLocal();
      if (branches.all.includes(branchName)) {
        statusText += `   Branch: ✅ ${branchName}\n`;

        // Get commit info
        try {
          const worktreeGit = simpleGit(worktreePath);
          const log = await worktreeGit.log({ from: 'main', to: 'HEAD', maxCount: 1 });
          if (log.total > 0) {
            const latestCommit = log.latest;
            statusText += `   Latest: ${latestCommit?.hash.substring(0, 7)} ${latestCommit?.message}\n`;
          } else {
            statusText += `   Latest: No commits yet\n`;
          }

          const status = await worktreeGit.status();
          if (status.files.length > 0) {
            statusText += `   Status: ${status.files.length} changed file(s)\n`;
          } else {
            statusText += `   Status: Working tree clean\n`;
          }
        } catch {
          statusText += `   Status: Unable to read git status\n`;
        }

        // Check for PR (using gh CLI)
        try {
          const { stdout: prUrl } = await execa('gh', ['pr', 'view', '--json', 'url', '-q', '.url'], { 
            stdio: 'pipe',
            cwd: worktreePath
          });
          if (prUrl.trim()) {
            const { stdout: prState } = await execa('gh', ['pr', 'view', '--json', 'state', '-q', '.state'], { 
              stdio: 'pipe',
              cwd: worktreePath
            });
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
        }

        // Check if Claude is running (basic process check)
        try {
          await execa('pgrep', ['-f', `claude.*${path.basename(worktreePath)}`], { stdio: 'pipe' });
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