import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from 'fs';   

async function run(): Promise<void> {
  try {
    const triggerOn = core.getInput('trigger_on', { required: true });
    core.info(`Triggering on: ${triggerOn}`);
    const userPrompt = core.getInput('prompt');

    // Manually check for required prompt based on trigger
    if (triggerOn === 'event' && !userPrompt) {
      core.setFailed('The "prompt" input is required when "trigger_on" is "event".');
      return;
    }

    const githubToken = core.getInput('github_token', { required: true });
    if (!githubToken) {
      throw new Error("GITHUB_TOKEN is required but not provided.");
    }

    const octokit = github.getOctokit(githubToken);
    const context = github.context;

    if (context.eventName !== "pull_request") {
      core.info(
        `Skipping Qoder action execution because the event is not a pull request.`,
      );
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

    const header = `<!-- QODER_HEADER_START -->\n👋 Hello! I'm Qoder, your AI code assistant.\n<!-- QODER_HEADER_END -->`;
    const body = `<!-- QODER_BODY_START -->\n⏳ I'm currently analyzing this pull request. I will post my findings directly in the PR thread.\n<!-- QODER_BODY_END -->`;
    const footer = `<!-- QODER_FOOTER_START -->
*You can view the live progress in the [action logs](${checkRunUrl}).*
<!-- QODER_FOOTER_END -->`;

    const welcomeMessage = `${header}\n\n---\n\n${body}\n\n${footer}`;

    const { data: comment } = await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: pr.number,
      body: welcomeMessage,
    });
    core.info(`Initial comment created with ID: ${comment.id}`);
    core.setOutput('comment_id', comment.id.toString());
    core.setOutput('run_id', runId.toString());

    // Prepare the MCP server config by injecting the real GitHub token
    const githubTokenForMcp = core.getInput('github_token', { required: true });
    if (githubTokenForMcp) {
      core.info(`Successfully read github_token. Length: ${githubTokenForMcp.length}`);
    } else {
      core.setFailed('Failed to read github_token, it is empty.');
      return;
    }

    const mcpConfigTemplate = {
      mcpServers: {
        github: {
          command: "docker",
          args: [
            "run",
            "-i",
            "--rm",
            "-e",
            "GITHUB_PERSONAL_ACCESS_TOKEN",
            "ghcr.io/github/github-mcp-server"
          ],
          env: [
            "GITHUB_PERSONAL_ACCESS_TOKEN={github_token}"
          ]
        }
      }
    };

    const configJson = JSON.stringify(mcpConfigTemplate, null, 2).replace('{github_token}', githubTokenForMcp);
    core.info(`Rendered config.json: ${configJson}`);
    core.setOutput('qoder_config_json', configJson);

    core.info('Gather PR infomation...');
    const { data: diff } = await octokit.rest.pulls.get({
      ...context.repo,
      pull_number: pr.number,
      mediaType: {
        format: "diff",
      },
    });

    const finalPrompt = `
      ${userPrompt}
      Pull Request Analysis Request:
      - PR Number: #${pr.number}
      - Branch: ${pr.head.ref}
      - Title: ${pr.title}
      - Author: @${pr.user.login}
      - Body: ${pr.body}`;

    fs.writeFileSync('./prompt.txt', finalPrompt);
    core.info(`Prompt (first 200 chars): ${finalPrompt.substring(0, 200)}...`);

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
