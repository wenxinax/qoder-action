
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import { HttpClient } from '@actions/http-client';
import { getCrSystemPrompt, getCrUserPrompt } from './prompts/cr';
import { getMentionSystemPrompt, getMentionUserPrompt } from './prompts/mention';
import { getDefaultSystemPrompt } from './prompts/custom';

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

    // 2. Create Initial Status Comment (if applicable)
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
    core.info(`Initial comment created with ID: ${comment.id}`);
    core.setOutput('comment_id', comment.id.toString());

    // 3. Scene-based Logic
    core.info(`Processing scene: ${scene}`);
    switch (scene) {
      case 'cr':
        finalSystemPrompt = getCrSystemPrompt();
        finalUserPrompt = getCrUserPrompt(pr, core.getInput('append_prompt'));
        break;

      case 'mention':
        if (context.eventName !== 'issue_comment') {
          throw new Error("The 'mention' scene must be used with an 'issue_comment' event.");
        }
        const commentBody = context.payload.comment?.body;
        if (!commentBody) {
          throw new Error("Comment body is missing from the event payload.");
        }
        finalSystemPrompt = getMentionSystemPrompt();
        finalUserPrompt = getMentionUserPrompt(commentBody, core.getInput('append_prompt'));
        break;

      case 'custom':
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

      default:
        throw new Error(`Unknown scene: '${scene}'. Valid scenes are 'cr', 'mention', 'custom'.`);
    }

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
      .replace(/{qoder_comment_id}/g, comment.id.toString())
      .replace(/{qoder_comment_type}/g, 'issue');

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

    core.setOutput('prompt_file_path', userPromptFilePath);
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
