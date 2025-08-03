import * as core from "@actions/core";
import * as github from "@actions/github";

async function run(): Promise<void> {
  try {
    const triggerOn = process.env.TRIGGER_ON;
    core.info(`Triggering on: ${triggerOn}`);
    if (triggerOn !== "event") {
      core.info(
        `Skipping Qoder action execution because trigger_on is not 'event'.`,
      );
      core.setOutput("should_run", "false");
      return;
    }

    const userPrompt = core.getInput('prompt', { required: true });

    const githubToken = process.env.GITHUB_TOKEN;
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

    core.info("Creating initial status comment...");
    const welcomeMessage =
      "👋 Hello! Qoder is analyzing this pull request. I will update this comment with the results shortly.";

    const { data: comment } = await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: pr.number,
      body: welcomeMessage,
    });
    core.info(`Initial comment created with ID: ${comment.id}`);
    core.setOutput('comment_id', comment.id.toString());

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
      - Title: ${pr.title}
      - Author: @${pr.user.login}
      - Body: ${pr.body}
      - Diff:\n      \`\`\`diff\n      ${diff}\n      \`\`\`\n    `;

    core.setOutput('should_run', "true");
    core.setOutput('prompt', finalPrompt);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unknown error occurred");
    }
  }
}

run();
