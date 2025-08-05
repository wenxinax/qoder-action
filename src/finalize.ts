import * as core from "@actions/core";
import * as github from "@actions/github";

// Helper function to update a section of the comment
function updateSection(originalBody: string, section: 'HEADER' | 'BODY' | 'FOOTER', newContent: string): string {
  const startMarker = `<!-- QODER_${section}_START -->`;
  const endMarker = `<!-- QODER_${section}_END -->`;

  const startIndex = originalBody.indexOf(startMarker);
  const endIndex = originalBody.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    core.warning(`Could not find markers for section ${section}. The comment might not be updated as expected.`);
    return `${originalBody}\n\n${newContent}`;
  }

  const before = originalBody.substring(0, startIndex + startMarker.length);
  const after = originalBody.substring(endIndex);

  return `${before}\n${newContent}\n${after}`;
}

async function run(): Promise<void> {
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    const commentIdStr = process.env.COMMENT_ID;
    const runId = process.env.RUN_ID;
    const qoderRunOutcome = process.env.QODER_RUN_OUTCOME || 'success';

    if (!githubToken) {
      throw new Error("GITHUB_TOKEN is required but not provided.");
    }
    if (!commentIdStr) {
      core.info("No comment ID provided, skipping comment update.");
      return;
    }
    const commentId = parseInt(commentIdStr, 10);

    const octokit = github.getOctokit(githubToken);
    const context = github.context;
    const pr = context.payload.pull_request;

    if (!pr) {
      throw new Error("Pull request payload is missing.");
    }

    // --- 1. Fetch the existing comment ---
    core.info(`Fetching existing comment with ID: ${commentId}`);
    const { data: existingComment } = await octokit.rest.issues.getComment({
      ...context.repo,
      comment_id: commentId,
    });

    let currentBody = existingComment.body || '';
    const checkRunUrl = `${pr.html_url}/checks?check_run_id=${runId}`;

    // --- 2. Define the new content for footer ---
    const finalFooterContent = `*Workflow finished. You can view the full execution details in the [action logs](${checkRunUrl}).*`;
    currentBody = updateSection(currentBody, 'FOOTER', finalFooterContent);

    // --- 3. If the core step failed, we MUST update the body to reflect that ---
    if (qoderRunOutcome === 'failure') {
      core.error("The qoder-run step failed. Overwriting body with failure message.");
      const failureBodyContent = `❌ **Analysis Step Failed**\n\nAn unexpected error occurred in the analysis step. Please review the [action logs](${checkRunUrl}) for detailed error messages.`;
      currentBody = updateSection(currentBody, 'BODY', failureBodyContent);
    }

    // --- 4. Update the comment on GitHub ---
    core.info("Updating final comment...");
    await octokit.rest.issues.updateComment({
      ...context.repo,
      comment_id: commentId,
      body: currentBody,
    });

    core.info("Comment updated successfully.");

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Failed to finalize: ${error.message}`);
    } else {
      core.setFailed("An unknown error occurred during finalization.");
    }
  }
}

run();
