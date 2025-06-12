import { execa } from 'execa';
import simpleGit from 'simple-git';
import * as fs from 'fs';

interface VerifySetupArgs {
  claudeCommand?: string;
  verbose?: boolean;
}

interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}

export async function verifySetup(args: VerifySetupArgs = {}) {
  const { claudeCommand = process.env.CLAUDE_COMMAND || 'claude', verbose = false } = args;
  
  const checks: Array<{ name: string; result: CheckResult }> = [];

  // Check 1: Git repository (ESSENTIAL)
  try {
    await execa('git', ['status'], { stdio: 'pipe' });
    checks.push({
      name: 'Git Repository',
      result: {
        status: 'pass',
        message: 'Git repository found',
        details: verbose ? 'Ready for worktree operations' : undefined
      }
    });
  } catch (error) {
    try {
      await execa('git', ['--version'], { stdio: 'pipe' });
      checks.push({
        name: 'Git Repository',
        result: {
          status: 'fail',
          message: 'Not in a git repository',
          details: 'Run this from your project root directory'
        }
      });
    } catch {
      checks.push({
        name: 'Git Repository',
        result: {
          status: 'fail',
          message: 'Git not available',
          details: 'Install git: https://git-scm.com'
        }
      });
    }
  }

  // Check 2: Claude Code availability (ESSENTIAL)
  try {
    const { stdout } = await execa('which', [claudeCommand], { stdio: 'pipe' });
    checks.push({
      name: 'Claude Code',
      result: {
        status: 'pass',
        message: 'Claude Code available',
        details: verbose ? `Found at: ${stdout.trim()}` : undefined
      }
    });
  } catch (error) {
    checks.push({
      name: 'Claude Code',
      result: {
        status: 'fail',
        message: `Claude Code not found at '${claudeCommand}'`,
        details: 'Install Claude Code or set CLAUDE_COMMAND environment variable'
      }
    });
  }

  // Check 3: GitHub CLI (ESSENTIAL for PR operations)
  try {
    await execa('gh', ['--version'], { stdio: 'pipe' });
    checks.push({
      name: 'GitHub CLI',
      result: {
        status: 'pass',
        message: 'GitHub CLI available',
        details: verbose ? 'Ready for PR operations' : undefined
      }
    });
  } catch (error) {
    checks.push({
      name: 'GitHub CLI',
      result: {
        status: 'fail',
        message: 'GitHub CLI (gh) not found',
        details: 'Install: brew install gh'
      }
    });
  }

  // Everything below is INFORMATIONAL (warnings only, not blocking)

  // Info: Git worktree support
  try {
    const { stdout } = await execa('git', ['--version'], { stdio: 'pipe' });
    const versionMatch = stdout.match(/git version (\d+)\.(\d+)/);
    if (versionMatch) {
      const major = parseInt(versionMatch[1]);
      const minor = parseInt(versionMatch[2]);
      if (major > 2 || (major === 2 && minor >= 5)) {
        checks.push({
          name: 'Git Worktree Support',
          result: {
            status: 'pass',
            message: 'Git worktree supported',
            details: verbose ? stdout.trim() : undefined
          }
        });
      } else {
        checks.push({
          name: 'Git Worktree Support',
          result: {
            status: 'warn',
            message: 'Git version might be too old',
            details: 'Worktrees work best with Git 2.5+, but will try anyway'
          }
        });
      }
    }
  } catch {
    // Skip if can't check version
  }

  // Info: Package manager
  try {
    await execa('pnpm', ['--version'], { stdio: 'pipe' });
    checks.push({
      name: 'Package Manager',
      result: {
        status: 'pass',
        message: 'pnpm available',
        details: verbose ? 'Will use pnpm for installations' : undefined
      }
    });
  } catch {
    try {
      await execa('npm', ['--version'], { stdio: 'pipe' });
      checks.push({
        name: 'Package Manager',
        result: {
          status: 'pass',
          message: 'npm available',
          details: verbose ? 'Will use npm for installations' : undefined
        }
      });
    } catch {
      checks.push({
        name: 'Package Manager',
        result: {
          status: 'warn',
          message: 'No package manager found',
          details: 'Install npm or pnpm for dependency management'
        }
      });
    }
  }

  // Generate summary
  const passed = checks.filter(c => c.result.status === 'pass').length;
  const warnings = checks.filter(c => c.result.status === 'warn').length;
  const failed = checks.filter(c => c.result.status === 'fail').length;

  const summary = `✅ ${passed} passed  ⚠️ ${warnings} warnings  ❌ ${failed} failed`;
  const overallStatus = failed > 0 ? 'fail' : 'pass'; // Warnings don't block usage

  // Format output
  let output = `# Claude Worktree Agent Setup Verification\n\n${summary}\n\n`;

  // Essential checks first
  const essentialChecks = checks.filter(c => 
    c.name === 'Git Repository' || 
    c.name === 'Claude Code' || 
    c.name === 'GitHub CLI'
  );

  output += '## Essential Requirements\n\n';
  for (const check of essentialChecks) {
    const icon = check.result.status === 'pass' ? '✅' : '❌';
    output += `${icon} **${check.name}**: ${check.result.message}\n`;
    if (check.result.details && (check.result.status === 'fail' || verbose)) {
      output += `   ${check.result.details}\n`;
    }
  }
  output += '\n';

  // Optional checks
  const optionalChecks = checks.filter(c => 
    c.name !== 'Git Repository' && 
    c.name !== 'Claude Code' && 
    c.name !== 'GitHub CLI'
  );

  if (optionalChecks.length > 0) {
    output += '## Additional Information\n\n';
    for (const check of optionalChecks) {
      const icon = check.result.status === 'pass' ? '✅' : '⚠️';
      output += `${icon} **${check.name}**: ${check.result.message}\n`;
      if (check.result.details && verbose) {
        output += `   ${check.result.details}\n`;
      }
    }
    output += '\n';
  }

  // Recommendations
  if (failed > 0) {
    output += '## 🚨 Required Actions\n\n';
    const failedChecks = checks.filter(c => c.result.status === 'fail');
    for (const check of failedChecks) {
      output += `- **${check.name}**: ${check.result.details || check.result.message}\n`;
    }
    output += '\n';
  }

  if (warnings > 0 && verbose) {
    output += '## ⚠️ Optional Improvements\n\n';
    const warnChecks = checks.filter(c => c.result.status === 'warn');
    for (const check of warnChecks) {
      output += `- **${check.name}**: ${check.result.details || check.result.message}\n`;
    }
    output += '\n';
  }

  if (overallStatus === 'pass') {
    output += '🎉 **Ready to use!** All essential requirements met.\n\n';
    output += 'Start your first feature:\n';
    output += '```\nfeature_start({\n  "featureFile": "path/to/your/feature.md"\n})\n```\n';
  } else {
    output += '❌ **Setup incomplete.** Please address the required actions above.\n';
  }

  return {
    content: [
      {
        type: 'text',
        text: output,
      },
    ],
  };
}