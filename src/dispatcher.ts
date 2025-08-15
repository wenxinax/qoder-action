import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import { HttpClient } from '@actions/http-client';
import { getCrSystemPrompt, getCrUserPrompt } from './prompts/cr';
import { getMentionSystemPrompt, getMentionUserPrompt, MentionContext } from './prompts/mention';
import { getDefaultSystemPrompt } from './prompts/custom';
import { Issue, PullRequest, IssueComment, PullRequestReviewComment } from '@octokit/webhooks-types';

// execSync is already here, which is great.
const { execSync } = require('child_process');

// This function is preserved from your original file to handle authentication.
async function getGithubToken(): Promise<string> {
  core.info('Requesting OIDC token...');
  const agentUrl = 'http://dev.lingma-agents-api.aliyuncs.com';
  const oidcToken = await core.getIDToken();
  core.info(`Successfully retrieved OIDC token (length: ${oidcToken.length}).`);

  const exchangeUrl = `${agentUrl}/v1/github/oidc/token`;
  core.info(`Exchanging OIDC token at: ${exchangeUrl}`)

  const httpClient = new HttpClient('qoder-action');
  const response = await httpClient.post(
    exchangeUrl,
    `oidc_token=${encodeURIComponent(oidcToken)}`,
    {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  );

  core.info(`Received response with status code: ${response.message.statusCode}`);
  const body = await response.readBody();
  core.info(`Response body: ${body}`);

  if (response.message.statusCode !== 200) {
    throw new Error(`Failed to get github_token. Status: ${response.message.statusCode}. Body: ${body}`);
  }

  const { installation_token } = JSON.parse(body);

  if (!installation_token) {
    throw new Error('`installation_token` not found in response.');
  }

  core.info('Successfully exchanged OIDC token for github_token.');

  return installation_token;
}

async function run(): Promise<void> {
  try {
    // 1. Get Inputs and Initialize
    const scene = core.getInput('scene', { required: true });
    const githubToken = await getGithubToken();
    core.setOutput('github_token', githubToken);
    core.setSecret(githubToken);
    const octokit = github.getOctokit(githubToken);
    const context = github.context;

    // --- MODIFICATION START ---
    // The 'insteadOf' config is removed and replaced with a more direct approach.
    
    core.info('=== Git Directory Debug Info (BEFORE) ===');
    try {
      const currentDir = execSync('pwd', { encoding: 'utf8' }).trim();
      core.info(`Current directory: ${currentDir}`);
      
      const gitRemote = execSync('git remote -v', { encoding: 'utf8' }).trim();
      core.info(`Current git remotes:\n${gitRemote}`);
      
      const isGitRepo = execSync('git rev-parse --is-inside-work-tree', { encoding: 'utf8' }).trim();
      core.info(`Is git repo: ${isGitRepo}`);
      
      // Check environment variables that might interfere
      core.info(`GITHUB_TOKEN env var exists: ${process.env.GITHUB_TOKEN ? 'Yes (hidden)' : 'No'}`);
      core.info(`GITHUB_ACTOR env var: ${process.env.GITHUB_ACTOR || 'Not set'}`);
      
      // Check current git config
      try {
        const currentUserName = execSync('git config user.name', { encoding: 'utf8' }).trim();
        const currentUserEmail = execSync('git config user.email', { encoding: 'utf8' }).trim();
        core.info(`Current git user: ${currentUserName} <${currentUserEmail}>`);
      } catch (e) {
        core.info('No git user configured yet');
      }
      
    } catch (error) {
      core.warning(`Pre-config debug info failed: ${error}`);
    }
    
    core.info('Setting up git identity with GitHub App credentials...');
    
    // Construct the new remote URL with the app token
    const repoUrl = `https://x-access-token:${githubToken}@github.com/${context.repo.owner}/${context.repo.repo}.git`;
    
    // It's best practice to set the committer's identity to the app's identity.
    // You can find your app's name and ID to form the email.
    const appName = 'qoder-app[bot]'; // Replace with your app's name if you wish
    const appEmail = 'qoder-app[bot]@users.noreply.github.com'; // Replace with your app's ID

    // Forcefully update the remote URL and set the user config for the repository
    try {
      // Clear any existing credential helpers that might interfere
      execSync('git config --unset-all credential.helper', { stdio: 'pipe' }).catch(() => {});
      
      execSync(`git remote set-url origin ${repoUrl}`, { stdio: 'pipe' });
      execSync(`git config user.name "${appName}"`, { stdio: 'pipe' });
      execSync(`git config user.email "${appEmail}"`, { stdio: 'pipe' });
      
      // Also set global git config to ensure consistency
      execSync(`git config --global user.name "${appName}"`, { stdio: 'pipe' });
      execSync(`git config --global user.email "${appEmail}"`, { stdio: 'pipe' });
      
      core.info(`Git remote URL updated and user configured as ${appName}.`);
      
      // Verify the changes
      core.info('=== Git Directory Debug Info (AFTER) ===');
      const newGitRemote = execSync('git remote -v', { encoding: 'utf8' }).trim();
      core.info(`Updated git remotes:\n${newGitRemote}`);
      
      const gitUserName = execSync('git config user.name', { encoding: 'utf8' }).trim();
      const gitUserEmail = execSync('git config user.email', { encoding: 'utf8' }).trim();
      core.info(`Git user configured as: ${gitUserName} <${gitUserEmail}>`);
      
    } catch (error) {
      core.warning(`Failed to configure git: ${error}`);
    }
    // --- MODIFICATION END ---

    let finalUserPrompt: string;
    let commentId: string;
    let commentType: 'issue' | 'review' = 'issue';

    const subagentTools = 'Glob,Grep,read,LS,WebFetch,WebSearch,Bash,mcp*';

    // 3. Scene-based Logic
    core.info(`Processing scene: ${scene}`);
    switch (scene) {
      case 'cr': {
        core.info('Setting up subagent for cr scene...');
        const agentsDir = path.join(process.cwd(), '.qoder', 'agents');
        fs.mkdirSync(agentsDir, { recursive: true });
        const crAgentContent = `--- 
name: github-action-pr-review
description: 负责github action pr review
tools: ${subagentTools}
---
${getCrSystemPrompt()}`;
        fs.writeFileSync(path.join(agentsDir, 'github-action-pr-review.md'), crAgentContent);
        core.info('Created github-action-pr-review.md subagent.');

        const pr = context.payload.pull_request;
        if (!pr) {
            throw new Error("Action currently only supports pull_request events.");
        }
        const runId = context.runId;
        const checkRunUrl = `${pr.html_url}/checks?check_run_id=${runId}`;
        const welcomeMessage = `<!-- QODER_HEADER_START -->
👋 Hello! I'm Qoder, your AI code assistant.
<!-- QODER_HEADER_END -->

---

<!-- QODER_BODY_START -->
⏳ I'm analyzing this pull request based on the **${scene}** scene. I will post my findings shortly.
<!-- QODER_BODY_END -->

<!-- QODER_FOOTER_START -->
*You can view the live progress in the [action logs](${checkRunUrl}).*
<!-- QODER_FOOTER_END -->`;

        const { data: comment } = await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: pr.number,
            body: welcomeMessage,
        });
        commentId = comment.id.toString();
        core.info(`Initial comment created with ID: ${commentId}`);
        const originalUserPrompt = getCrUserPrompt(pr as PullRequest, core.getInput('append_prompt'));
        finalUserPrompt = `请用 github-action-pr-review 传入以下 prompt：
1) 仅【转发】而非【处理/修改】Prompt；
2) 禁止添加或删除任何字符（空格、换行亦禁止）。
转发内容如下↓↓↓
====================
${originalUserPrompt}
====================
`;
        break;
      }

      case 'mention': {
        core.info('Setting up subagent for mention scene...');
        const agentsDir = path.join(process.cwd(), '.qoder', 'agents');
        fs.mkdirSync(agentsDir, { recursive: true });
        const mentionAgentContent = `--- 
name: github-action-mention-handler
description: 负责处理在github pr/issue中的@mention
tools: ${subagentTools}
---
${getMentionSystemPrompt()}`;
        fs.writeFileSync(path.join(agentsDir, 'github-action-mention-handler.md'), mentionAgentContent);
        core.info('Created github-action-mention-handler.md subagent.');

        core.info(JSON.stringify(context, null, 2));

        core.info('-----------------');
        core.info(`Event name: ${context.eventName}`);
        core.info('-----------------');

        const commentPayload = context.payload.comment as IssueComment | PullRequestReviewComment;
        core.info('Comment payload:');
        core.info(JSON.stringify(commentPayload, null, 2));
        core.info('-----------------');

        const allowedEvents = ['issue_comment', 'pull_request_review_comment'];
        if (!allowedEvents.includes(context.eventName)) {
          throw new Error(`The 'mention' scene only works with '${allowedEvents.join("or ")}' events.`);
        }

        if (!commentPayload) {
          core.info("Comment payload is missing, skipping.");
          core.setOutput('should_run', 'false');
          return;
        }

        const commentBody = commentPayload.body;
        if (!commentBody.includes('@qoder')) {
          core.info("Comment does not mention @qoder, skipping.");
          core.setOutput('should_run', 'false');
          return;
        }

        const issue = context.payload.issue as Issue;
        const pr = context.payload.pull_request as PullRequest;
        const source = pr || issue;

        const mentionContext: MentionContext = {
          type: pr ? 'pr' : 'issue',
          source: source,
          owner: context.repo.owner,
          repo: context.repo.repo,
        };

        if (pr) {
          commentType = 'review';
        }

        if (context.eventName === 'pull_request_review_comment') {
            const reviewComment = commentPayload as PullRequestReviewComment;
            if (reviewComment.line !== null) {
                mentionContext.code_context = {
                    path: reviewComment.path,
                    diff_hunk: reviewComment.diff_hunk,
                    start_line: reviewComment.start_line ?? undefined,
                    line: reviewComment.line,
                };
            }
        }

        if (context.eventName === 'pull_request_review_comment') {
            core.info('进入 pull_request_review_comment 逻辑分支');
            const reviewComment = commentPayload as PullRequestReviewComment;
            if (reviewComment.in_reply_to_id) {
                core.info(`正在处理回复评论，in_reply_to_id: ${reviewComment.in_reply_to_id}`);
                const allReviewComments = await octokit.paginate(octokit.rest.pulls.listReviewComments, {
                    ...context.repo,
                    pull_number: pr.number,
                });
                core.info(`获取到 ${allReviewComments.length} 条评审评论`);
                core.debug(`所有评审评论内容: ${JSON.stringify(allReviewComments, null, 2)}`);

                const topLevelComment = allReviewComments.find(c => c.id === reviewComment.in_reply_to_id);
                if (topLevelComment) {
                    core.info(`找到顶层评论: ${topLevelComment.id}`);
                    const thread = [topLevelComment, ...allReviewComments.filter(c => c.in_reply_to_id === reviewComment.in_reply_to_id)];
                    mentionContext.thread = thread;
                    core.info(`构建出的对话线程包含 ${thread.length} 条评论`);
                    core.debug(`构建的线程内容: ${JSON.stringify(thread, null, 2)}`);
                } else {
                    core.warning('没有找到顶层评论');
                }
            } else {
                core.info('评论不是一个回复，不构建对话线程');
            }
        }

        const runId = context.runId;
        const checkRunUrl = `${source.html_url}/checks?check_run_id=${runId}`;
        const welcomeMessage = `<!-- QODER_HEADER_START -->
👋 Hello! I'm Qoder, your AI code assistant.
<!-- QODER_HEADER_END -->

---

<!-- QODER_BODY_START -->
⏳ I'm analyzing your request... I will post my findings shortly.
<!-- QODER_BODY_END -->

<!-- QODER_FOOTER_START -->
*You can view the live progress in the [action logs](${checkRunUrl}).*
<!-- QODER_FOOTER_END -->`;

        if (context.eventName === 'pull_request_review_comment') {
            const { data: replyComment } = await octokit.rest.pulls.createReplyForReviewComment({
                ...context.repo,
                pull_number: pr.number,
                body: welcomeMessage,
                comment_id: commentPayload.id
            });
            commentId = replyComment.id.toString();
        } else { // issue_comment
            const { data: replyComment } = await octokit.rest.issues.createComment({
                ...context.repo,
                issue_number: source.number,
                body: welcomeMessage,
            });
            commentId = replyComment.id.toString();
        }
        
        core.info(`Reply comment created with ID: ${commentId}`);

        const originalUserPrompt = getMentionUserPrompt(mentionContext, commentBody, core.getInput('append_prompt'));
        finalUserPrompt = `请用 github-action-mention-handler 传入以下 prompt：
1) 仅【转发】而非【处理/修改】Prompt；
2) 禁止添加或删除任何字符。
转发内容如下↓↓↓
====================
${originalUserPrompt}
====================
`;
        core.info('--- 生成的最终用户 Prompt ---');
        core.info(finalUserPrompt);
        core.info('--------------------------');
        core.setOutput('comment_type', commentType);
        break;
      }

      case 'custom': {
        core.info('Setting up subagent for custom scene...');
        const agentsDir = path.join(process.cwd(), '.qoder', 'agents');
        fs.mkdirSync(agentsDir, { recursive: true });
        const customAgentContent = `--- 
name: github-action-custom-task
description: 在 github 环境执行用户定义的自定义任务
tools: ${subagentTools}
---
${getDefaultSystemPrompt()}`;
        fs.writeFileSync(path.join(agentsDir, 'github-action-custom-task.md'), customAgentContent);
        core.info('Created github-action-custom-task.md subagent.');

        const pr = context.payload.pull_request;
        if (!pr) {
            throw new Error("Action currently only supports pull_request events.");
        }
        const runId = context.runId;
        const checkRunUrl = `${pr.html_url}/checks?check_run_id=${runId}`;
        const welcomeMessage = `<!-- QODER_HEADER_START -->
👋 Hello! I'm Qoder, your AI code assistant.
<!-- QODER_HEADER_END -->

---

<!-- QODER_BODY_START -->
⏳ I'm analyzing this pull request based on the **custom** scene. I will post my findings shortly.
<!-- QODER_BODY_END -->

<!-- QODER_FOOTER_START -->
*You can view the live progress in the [action logs](${checkRunUrl}).*
<!-- QODER_FOOTER_END -->`;

        const { data: comment } = await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: pr.number,
            body: welcomeMessage,
        });
        commentId = comment.id.toString();
        core.info(`Initial comment created with ID: ${commentId}`);

        const userPrompt = core.getInput('prompt', { required: true });
        const originalUserPrompt = `### Pull Request Context
- **Title**: ${pr.title}
- **Author**: @${pr.user.login}
- **Description**:
${pr.body || 'No description provided.'}

### User Instruction
${userPrompt}`;
        finalUserPrompt = `请用 github-action-custom-task 传入以下 prompt：
====================
${originalUserPrompt}
====================
请务必要求subagent完整完成任务，不要中途停止。
`;
        break;
      }

      default:
        throw new Error(`Unknown scene: '${scene}'. Valid scenes are 'cr', 'mention', 'custom'.`);
    }

    core.setOutput('comment_id', commentId);

    // 4. Generate .mcp.json
    const mcpConfig = {
        mcpServers: {
          "github": {
            "command": "docker",
            "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "-e", "GITHUB_TOOLSETS", "ghcr.io/github/github-mcp-server"],
            "env": { 
              "GITHUB_PERSONAL_ACCESS_TOKEN": githubToken,
              "GITHUB_TOOLSETS": "context,repos,issues,pull_requests,discussions"
            },
            "type": "stdio"
          },
          "qoder-github": {
            "command": "docker",
            "args": ["run", "-i", "--rm", "-e", "GITHUB_TOKEN", "-e", "GITHUB_OWNER", "-e", "GITHUB_REPO", "-e", "QODER_COMMENT_ID", "-e", "QODER_COMMENT_TYPE", "ghcr.io/wenxinax/qoder-github-mcp-server:latest"],
            "env": {
              "GITHUB_TOKEN": githubToken,
              "GITHUB_OWNER": context.repo.owner,
              "GITHUB_REPO": context.repo.repo,
              "QODER_COMMENT_ID": commentId,
              "QODER_COMMENT_TYPE": commentType
            },
            "type": "stdio"
          }
        }
    };
    const mcpConfigPath = path.join(process.cwd(), '.mcp.json');
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    core.info(`Created .mcp.json configuration file at ${mcpConfigPath}`);

    // 5. Set Final Outputs
    const userPromptFilePath = './prompt.txt';
    fs.writeFileSync(userPromptFilePath, finalUserPrompt);
    core.info(`Final user prompt written to ${userPromptFilePath}.`);
    core.debug(`Prompt content (first 200 chars): ${finalUserPrompt.substring(0, 200)}...`);

    core.setOutput('prompt_path', userPromptFilePath);
    core.setOutput('should_run', 'true');

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

run();