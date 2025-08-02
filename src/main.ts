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
    // 检查是否有必要的上下文信息
    if (!context.repository || !context.event || !context.event.pull_request) {
      console.log('❌ Missing repository or PR context, skipping comment');
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

    // 使用更安全的方式获取仓库信息
    const owner = context.repository.owner?.login || context.repository.owner_name;
    const repo = context.repository.name;
    const issueNumber = context.event.pull_request.number;

    console.log(`📋 Creating comment for ${owner}/${repo}#${issueNumber}`);

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
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