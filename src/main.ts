import * as core from '@actions/core';
import * as github from '@actions/github';
import { execSync } from 'child_process';
import * as path from 'path';

interface CliResponse {
  message: string;
  user_input: string;
  success: boolean;
}

async function main() {
  try {
    const userInput = process.env.USER_INPUT || '';
    const githubToken = process.env.GITHUB_TOKEN || '';
    const githubContext = JSON.parse(process.env.GITHUB_CONTEXT || '{}');

    // 调用Go CLI工具
    const cliPath = path.resolve(process.env.GITHUB_ACTION_PATH || '.', 'cli', 'qoder-cli');
    const cliOutput = execSync(`${cliPath} greet "${userInput}"`, { 
      encoding: 'utf-8',
      cwd: process.cwd()
    });

    const cliResponse: CliResponse = JSON.parse(cliOutput.trim());

    // 如果是PR事件，添加评论
    if (githubContext.event_name === 'pull_request' && githubToken) {
      await addPRComment(githubToken, githubContext, cliResponse);
    }

    // 设置输出
    core.setOutput('result', JSON.stringify({
      success: true,
      cli_response: cliResponse,
      timestamp: new Date().toISOString()
    }));

  } catch (error) {
    console.error('❌ Error in Qoder Action:', error);
    process.exit(1);
  }
}

async function addPRComment(token: string, context: any, cliResponse: CliResponse) {
  try {
    const githubRepository = process.env.GITHUB_REPOSITORY;
    if (!githubRepository || !context.event?.pull_request) return;

    const [owner, repo] = githubRepository.split('/');
    const prNumber = context.event.pull_request.number;
    const octokit = github.getOctokit(token);
    
    const commentBody = `## 🤖 Qoder Action Result

${cliResponse.message}

**Details:**
- User Input: \`${cliResponse.user_input}\`
- Status: ${cliResponse.success ? '✅ Success' : '❌ Failed'}
- Timestamp: ${new Date().toISOString()}

---
_Powered by Qoder Action_ 🚀`;

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody
    });
  } catch (error) {
    // PR评论失败不应该影响主流程
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});