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
    // 获取环境变量
    const userInput = process.env.USER_INPUT || '';
    const githubToken = process.env.GITHUB_TOKEN || '';
    const githubContext = JSON.parse(process.env.GITHUB_CONTEXT || '{}');

    console.log('🚀 Starting Qoder Action MVP...');
    console.log(`📝 User input: ${userInput}`);
    console.log(`🎯 Event: ${githubContext.event_name}`);
    console.log(`🔍 Repository info:`, JSON.stringify({
      repository: githubContext.repository,
      event_name: githubContext.event_name,
      actor: githubContext.actor,
      ref: githubContext.ref
    }, null, 2));

    // 调用Go CLI工具
    const cliPath = path.resolve(process.env.GITHUB_ACTION_PATH || '.', 'cli', 'qoder-cli');
    console.log(`🔧 Calling CLI tool: ${cliPath}`);
    
    const cliOutput = execSync(`${cliPath} greet "${userInput}"`, { 
      encoding: 'utf-8',
      cwd: process.cwd()
    });

    const cliResponse: CliResponse = JSON.parse(cliOutput.trim());
    console.log('✅ CLI Response:', cliResponse);

    // 如果是PR事件，添加评论
    if (githubContext.event_name === 'pull_request' && githubToken) {
      await addPRComment(githubToken, githubContext, cliResponse);
    }

    // 设置输出
    const result = {
      success: true,
      cli_response: cliResponse,
      timestamp: new Date().toISOString()
    };

    // 为GitHub Actions设置输出
    core.setOutput('result', JSON.stringify(result));
    
    console.log('🎉 Qoder Action completed successfully!');

  } catch (error) {
    console.error('❌ Error in Qoder Action:', error);
    process.exit(1);
  }
}

async function addPRComment(token: string, context: any, cliResponse: CliResponse) {
  try {
    // 使用 GitHub 环境变量获取仓库信息
    const githubRepository = process.env.GITHUB_REPOSITORY; // 格式: owner/repo
    const eventName = process.env.GITHUB_EVENT_NAME;
    
    console.log(`📊 GitHub env vars: GITHUB_REPOSITORY=${githubRepository}, GITHUB_EVENT_NAME=${eventName}`);
    
    if (eventName !== 'pull_request') {
      console.log('❌ Not a pull_request event, skipping comment');
      return;
    }

    if (!githubRepository) {
      console.log('❌ GITHUB_REPOSITORY not found, skipping comment');
      return;
    }

    const [owner, repo] = githubRepository.split('/');
    
    // 尝试从多个来源获取 PR 号码
    let prNumber;
    if (context.event && context.event.pull_request) {
      prNumber = context.event.pull_request.number;
    } else if (context.event && context.event.number) {
      prNumber = context.event.number;
    } else {
      console.log('❌ Cannot find PR number, skipping comment');
      return;
    }

    const octokit = github.getOctokit(token);
    
    const commentBody = `## 🤖 Qoder Action Result

${cliResponse.message}

**Details:**
- User Input: \`${cliResponse.user_input}\`
- Status: ${cliResponse.success ? '✅ Success' : '❌ Failed'}
- Timestamp: ${new Date().toISOString()}

---
_Powered by Qoder Action MVP_ 🚀`;

    console.log(`📋 Creating comment for ${owner}/${repo}#${prNumber}`);

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody
    });

    console.log('💬 Added comment to PR successfully');
  } catch (error) {
    console.error('Failed to add PR comment:', error);
  }
}

// 运行主函数
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});