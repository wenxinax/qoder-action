import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from 'fs';
import { HttpClient } from '@actions/http-client';

interface SystemPromptOptions {
  withPrReviewPrompt?: boolean;
}

function getPrReviewPrompt(): string {
  const reviewInstructions = `
你是 Qoder，一个专业的代码审查 AI 助手。你的主要职责是对 Pull Request 进行全面且深入的代码审查。
系统已经预先发送了一条状态评论，这是与用户实时沟通的唯一窗口。请使用qoder-github-mcp-server_qoder_update_comment 在状态评论中维护整个审查任务的追踪。

**审查流程：**

1. 使用 qoder-github-mcp-server_qoder_update_comment 创建待办事项列表 (Todo List)：
   - 使用你的状态评论来维护一个基于请求的详细任务列表。
   - 将待办事项格式化为清单（- [ ] 代表未完成，- [x] 代表已完成）。
   - 每完成一项任务，就使用 qoder-github-mcp-server_qoder_update_comment 更新评论。

2. **详细审查** (行间评论 + 状态更新)
   - 逐文件进行代码审查
   - 对具体问题发表行间评论，请使用 qoder_add_comment_to_pending_review 发表行间评论。
   - [ ] **进度更新**: 使用 qoder-github-mcp-server_qoder_update_comment 实时更新每个审查进度和状态。

3. 在状态评论中更新任务完成情况。

**限制说明：**
- 可以发表review评论和建议
- **不能**批准或合并PR（安全限制）
- **不能**直接修改代码（除非明确被要求修复简单问题）
- 所有沟通通过 qoder-github-mcp-server_qoder_update_comment 工具进行
`;

  return reviewInstructions;
}

function getSystemPrompt(options?: SystemPromptOptions): string {
  if (options?.withPrReviewPrompt) {
    return getPrReviewPrompt();
  }
  
  const instructions = `
你是 Qoder，一个专业的代码审查 AI 助手。你的主要职责是对 Pull Request 进行全面且深入的代码审查。
系统已经预先发送了一条状态评论，这是与用户实时沟通的唯一窗口。请使用qoder-github-mcp-server_qoder_update_comment 在状态评论中维护整个审查任务的追踪。

**审查流程：**

1. 使用 qoder-github-mcp-server_qoder_update_comment 创建待办事项列表 (Todo List)：
   - 使用你的状态评论来维护一个基于请求的详细任务列表。
   - 将待办事项格式化为清单（- [ ] 代表未完成，- [x] 代表已完成）。
   - 每完成一项任务，就使用 qoder-github-mcp-server_qoder_update_comment 更新评论。

2. **详细审查** (行间评论 + 状态更新)
   - 逐文件进行代码审查
   - 对具体问题发表行间评论，请使用 qoder_add_comment_to_pending_review 发表行间评论。
   - [ ] **进度更新**: 使用 qoder-github-mcp-server_qoder_update_comment 实时更新每个审查进度和状态。

3. 在状态评论中更新任务完成情况。

**限制说明：**
- 可以发表review评论和建议
- **不能**批准或合并PR（安全限制）
- **不能**直接修改代码（除非明确被要求修复简单问题）
- 所有沟通通过 qoder-github-mcp-server_qoder_update_comment 工具进行
`;

  return instructions;
}

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
    `oidc_token=${encodeURIComponent(oidcToken)}`, // 发送 x-www-form-urlencoded 数据
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
    const githubToken = await getGithubToken();
    core.setOutput('github_token', githubToken);
    core.setSecret(githubToken);

    const triggerOn = core.getInput('trigger_on', { required: true });
    core.info(`Triggering on: ${triggerOn}`);
    const userPrompt = core.getInput('prompt');
    const withPrReviewPrompt = core.getInput('with_pr_review_prompt') === 'true';

    if (triggerOn === 'event' && !userPrompt) {
      core.setFailed('The "prompt" input is required when "trigger_on" is "event".');
      return;
    }

    const octokit = github.getOctokit(githubToken);
    const context = github.context;

    if (context.eventName !== "pull_request") {
      core.info(`Skipping Qoder action execution because the event is not a pull request.`);
      core.setOutput("should_run", "false");
      return;
    }

    const pr = context.payload.pull_request;
    if (!pr) {
      throw new Error("Pull request payload is missing.");
    }
    core.debug(`Processing pull request: ${pr.title} (#${pr.number})`);

    const runId = context.runId;
    const checkRunUrl = `${pr.html_url}/checks?check_run_id=${runId}`;
    core.info(`Check run URL: ${checkRunUrl}`);

    core.info("Creating initial status comment...");

    const header = `<!-- QODER_HEADER_START -->
👋 Hello! I'm Qoder, your AI code assistant.
<!-- QODER_HEADER_END -->`;
    const body = `<!-- QODER_BODY_START -->
⏳ I'm currently analyzing this pull request. I will post my findings directly in the PR thread.
<!-- QODER_BODY_END -->`;
    const footer = `<!-- QODER_FOOTER_START -->
*You can view the live progress in the [action logs](${checkRunUrl}).*
<!-- QODER_FOOTER_END -->`;

    const welcomeMessage = `${header}

---

${body}

${footer}`;

    const { data: comment } = await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: pr.number,
      body: welcomeMessage,
    });
    core.info(`Initial comment created with ID: ${comment.id}`);
    core.setOutput('comment_id', comment.id.toString());
    core.setOutput('run_id', runId.toString());

    const mcpConfigTemplate = {
      mcpServers: {
        "github": {
          "command": "docker",
          "args": [
            "run",
            "-i",
            "--rm",
            "-e",
            "GITHUB_PERSONAL_ACCESS_TOKEN",
            "ghcr.io/github/github-mcp-server"
          ],
          "env": [
            "GITHUB_PERSONAL_ACCESS_TOKEN={github_token}"
          ]
        },
        "qoder-github-mcp-server": {
          "command": "docker",
          "args": [
            "run",
            "-i",
            "--rm",
            "-e", "GITHUB_TOKEN",
            "-e", "GITHUB_OWNER",
            "-e", "GITHUB_REPO",
            "-e", "QODER_COMMENT_ID",
            "-e", "QODER_COMMENT_TYPE",
            "ghcr.io/wenxinax/qoder-github-mcp-server:latest"
          ],
          "env": [
            "GITHUB_TOKEN={github_token}",
            "GITHUB_OWNER={github_owner}",
            "GITHUB_REPO={github_repo}",
            "QODER_COMMENT_ID={qoder_comment_id}",
            "QODER_COMMENT_TYPE={qoder_comment_type}"
          ]
        }
      }
    };

    let configJson = JSON.stringify(mcpConfigTemplate, null, 2);

    configJson = configJson
      .replace(/{github_token}/g, githubToken)
      .replace(/{github_owner}/g, context.repo.owner)
      .replace(/{github_repo}/g, context.repo.repo)
      .replace(/{qoder_comment_id}/g, comment.id.toString())
      .replace(/{qoder_comment_type}/g, 'issue');

    core.info(`Rendered config.json: ${configJson}`);
    core.setOutput('qoder_config_json', configJson);

    const systemPrompt = getSystemPrompt({ withPrReviewPrompt });
    core.setOutput('system_prompt', systemPrompt);

    const final_prompt = `### Pull Request Context
- **Owner**: ${github.context.repo.owner}
- **Repo**: ${github.context.repo.repo}
- **PR Number**: #${pr.number}
- **Branch**: ${pr.head.ref}
- **Title**: ${pr.title}
- **Author**: @${pr.user.login}
- **Description**:
${pr.body || 'No description provided.'}

 以下是用户的直接指令:${userPrompt || 'No direct instruction provided.'}`;

    fs.writeFileSync('./prompt.txt', final_prompt);
    core.info(`Prompt (first 200 chars): ${userPrompt.substring(0, 200)}...`);

    core.setOutput('should_run', "true");
    core.setOutput('prompt_file_path', './prompt.txt');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unknown error occurred");
    }
  }
}

run();