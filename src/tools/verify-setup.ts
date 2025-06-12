import { execa } from 'execa';
import simpleGit from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';

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

  // Get working directory - require PROJECT_ROOT env var for Cursor MCP
  const projectRoot = process.env.PROJECT_ROOT;
  if (!projectRoot) {
    throw new Error('PROJECT_ROOT environment variable not set. This is required for Cursor MCP. Add "env": {"PROJECT_ROOT": "/path/to/your/project"} to your MCP configuration.');
  }
  
  const cwd = projectRoot;
  
  // Check 1: Git CLI installation (ESSENTIAL)
  try {
    const { stdout } = await execa('git', ['--version'], { stdio: 'pipe' });
    checks.push({
      name: 'Git CLI',
      result: {
        status: 'pass',
        message: 'Git CLI available',
        details: verbose ? stdout.trim() : undefined
      }
    });
  } catch (error) {
    checks.push({
      name: 'Git CLI',
      result: {
        status: 'fail',
        message: 'Git CLI not found',
        details: 'Install git: https://git-scm.com'
      }
    });
  }

  // Check 2: Git repository status (ESSENTIAL)
  try {
    // Use the project root directory for git operations
    const result = await execa('git', ['rev-parse', '--is-inside-work-tree'], { 
      stdio: 'pipe',
      cwd: cwd
    });
    
    if (result.stdout.trim() === 'true') {
      checks.push({
        name: 'Git Repository',
        result: {
          status: 'pass',
          message: 'Git repository found',
          details: verbose ? `Project directory: ${cwd}` : undefined
        }
      });
    } else {
      checks.push({
        name: 'Git Repository',
        result: {
          status: 'fail',
          message: 'Not in a git repository',
          details: `Command returned: ${result.stdout.trim()} | Directory: ${cwd}`
        }
      });
    }
  } catch (error) {
    // Add comprehensive debugging information
    let debugInfo = `Directory: ${cwd}`;
    if (error instanceof Error) {
      debugInfo += ` | Error: ${error.message}`;
    }
    
    // Check for execa specific error properties
    if (error && typeof error === 'object') {
      if ('exitCode' in error) {
        debugInfo += ` | Exit code: ${error.exitCode}`;
      }
      if ('stderr' in error && error.stderr) {
        debugInfo += ` | stderr: ${error.stderr}`;
      }
      if ('stdout' in error && error.stdout) {
        debugInfo += ` | stdout: ${error.stdout}`;
      }
    }
    
    checks.push({
      name: 'Git Repository',
      result: {
        status: 'fail',
        message: 'Git repository check failed',
        details: debugInfo
      }
    });
  }

  // Check 3: GitHub CLI installation (ESSENTIAL)
  try {
    const { stdout } = await execa('gh', ['--version'], { stdio: 'pipe' });
    checks.push({
      name: 'GitHub CLI',
      result: {
        status: 'pass',
        message: 'GitHub CLI available',
        details: verbose ? stdout.split('\n')[0] : undefined
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

  // Check 4: GitHub CLI authentication (INFORMATIONAL)
  try {
    const { stdout } = await execa('gh', ['auth', 'status'], { stdio: 'pipe' });
    checks.push({
      name: 'GitHub Authentication',
      result: {
        status: 'pass',
        message: 'GitHub authentication active',
        details: verbose ? 'Ready for PR operations' : undefined
      }
    });
  } catch (error) {
    checks.push({
      name: 'GitHub Authentication',
      result: {
        status: 'warn',
        message: 'Not authenticated with GitHub',
        details: 'Run: gh auth login'
      }
    });
  }

  // Check 5: Claude Code availability (ESSENTIAL)
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
    c.name === 'Git CLI' || 
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
    c.name !== 'Git CLI' && 
    c.name !== 'Git Repository' && 
    c.name !== 'Claude Code' && 
    c.name !== 'GitHub CLI'
  );

  if (optionalChecks.length > 0) {
    output += '## Additional Information\n\n';
    for (const check of optionalChecks) {
      const icon = check.result.status === 'pass' ? '✅' : '⚠️';
      output += `${icon} **${check.name}**: ${check.result.message}\n`;
      if (check.result.details && (check.result.status === 'fail' || verbose)) {
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