import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import { HttpClient } from '@actions/http-client';
import { getCrSystemPrompt, getCrUserPrompt } from './prompts/cr';
import { getMentionSystemPrompt, getMentionUserPrompt, MentionContext } from './prompts/mention';
import { getDefaultSystemPrompt } from './prompts/custom';
import { Issue, PullRequest, IssueComment, PullRequestReviewComment } from '@octokit/webhooks-types';

// This function is preserved from the original file to handle authentication.
async function getGithubToken(): Promise<string> {
  core.info('Requesting OIDC token...');
  const agentUrl = 'http://dev.lingma-agents-api.aliyuncs.com';
  const oidcToken = await core.getIDToken();
  core.info(`Successfully retrieved OIDC token (length: ${oidcToken.length}).`);
  core.debug(`OIDC Token (first 30 chars): ${oidcToken.substring(0, 30)}...`);

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

    let finalSystemPrompt: string;
    let finalUserPrompt: string;
    let commentId: string;
    let commentType: 'issue' | 'review' = 'issue';

    // 3. Scene-based Logic
    core.info(`Processing scene: ${scene}`);
    switch (scene) {
      case 'cr': {
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
        finalSystemPrompt = getCrSystemPrompt();
        finalUserPrompt = getCrUserPrompt(pr as PullRequest, core.getInput('append_prompt'));
        break;
      }

      case 'mention': {
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

        if ('in_reply_to_id' in commentPayload && commentPayload.in_reply_to_id) {
          const allComments = pr
            ? (await octokit.rest.pulls.listReviewComments({ ...context.repo, pull_number: pr.number })).data
            : (await octokit.rest.issues.listComments({ ...context.repo, issue_number: issue.number })).data;

          const buildThread = (commentId: number) => {
            const thread: (IssueComment | PullRequestReviewComment)[] = [];
            let currentComment: any = allComments.find(c => c.id === commentId);
            while (currentComment) {
              thread.unshift(currentComment);
              const parentId = currentComment.in_reply_to_id;
              currentComment = parentId ? allComments.find(c => c.id === parentId) : undefined;
            }
            return thread;
          };

          mentionContext.thread = buildThread(commentPayload.id);
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

        finalSystemPrompt = getMentionSystemPrompt();
        finalUserPrompt = getMentionUserPrompt(mentionContext, commentBody, core.getInput('append_prompt'));
        core.setOutput('comment_type', commentType);
        break;
      }

      case 'custom': {
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
        finalSystemPrompt = core.getInput('system_prompt') || getDefaultSystemPrompt();
        finalUserPrompt = `### Pull Request Context
- **Title**: ${pr.title}
- **Author**: @${pr.user.login}
- **Description**:
${pr.body || 'No description provided.'}

### User Instruction
${userPrompt}`;
        break;
      }

      default:
        throw new Error(`Unknown scene: '${scene}'. Valid scenes are 'cr', 'mention', 'custom'.`);
    }

    core.setOutput('comment_id', commentId);

    // 4. Generate MCP Config (preserved from original)
    const mcpConfigTemplate = {
        mcpServers: {
          "github": {
            "command": "docker",
            "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
            "env": ["GITHUB_PERSONAL_ACCESS_TOKEN={github_token}"]
          },
          "qoder-github-mcp-server": {
            "command": "docker",
            "args": ["run", "-i", "--rm", "-e", "GITHUB_TOKEN", "-e", "GITHUB_OWNER", "-e", "GITHUB_REPO", "-e", "QODER_COMMENT_ID", "-e", "QODER_COMMENT_TYPE", "ghcr.io/wenxinax/qoder-github-mcp-server:latest"],
            "env": ["GITHUB_TOKEN={github_token}", "GITHUB_OWNER={github_owner}", "GITHUB_REPO={github_repo}", "QODER_COMMENT_ID={qoder_comment_id}", "QODER_COMMENT_TYPE={qoder_comment_type}"]
          }
        }
    };
    let configJson = JSON.stringify(mcpConfigTemplate, null, 2)
      .replace(/{github_token}/g, githubToken)
      .replace(/{github_owner}/g, context.repo.owner)
      .replace(/{github_repo}/g, context.repo.repo)
      .replace(/{qoder_comment_id}/g, commentId)
      .replace(/{qoder_comment_type}/g, commentType);

    core.info(`Rendered config.json: ${configJson}`);
    core.setOutput('qoder_config_json', configJson);

    // 5. Set Final Outputs
    const systemPromptFilePath = './system_prompt.txt';
    fs.writeFileSync(systemPromptFilePath, finalSystemPrompt);
    core.info(`Final system prompt written to ${systemPromptFilePath}.`);
    core.setOutput('system_prompt_path', systemPromptFilePath);

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