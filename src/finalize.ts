import * as core from "@actions/core";
import * as github from "@actions/github";

function getSectionContent(body: string, section: 'HEADER' | 'BODY' | 'FOOTER'): string {
  const startMarker = `<!-- QODER_${section}_START -->`;
  const endMarker = `<!-- QODER_${section}_END -->`;

  const startIndex = body.indexOf(startMarker);
  const endIndex = body.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    core.warning(`Could not find markers for section ${section} in comment body.`);
    return '';
  }

  return body.substring(startIndex + startMarker.length, endIndex).trim();
}

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
    const withFixUrl = process.env.WITH_FIX_URL === 'true';

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
    let finalFooterContent = `*Workflow finished. You can view the full execution details in the [action logs](${checkRunUrl}).*`;

    // --- 3. Add the fix URL if requested ---
    if (withFixUrl) {
      const qoderBody = getSectionContent(currentBody, 'BODY');
      if (qoderBody) {
        const fixPrompt = `Based on the following code review for pull request #${pr.number}, please fix the identified issues.\n\n**PR Title**: ${pr.title}\n**Author**: @${pr.user.login}\n\n---\n\n**Review Comments**:\n${qoderBody}`;

        const fixContext = {
          repo: context.repo.repo,
          owner: context.repo.owner,
          prNumber: pr.number,
          prompt: fixPrompt
        };
        const base64Context = Buffer.from(JSON.stringify(fixContext)).toString('base64');
        // This assumes you have a service that can decode this context
        const fixUrl = `https://your-fix-service.com?context=${base64Context}`;
        finalFooterContent += `\n\n[✨ One-Click Qoder Fix](${fixUrl})`;
      } else {
        core.warning('Could not add fix URL because the review body was empty.');
      }
    }

    currentBody = updateSection(currentBody, 'FOOTER', finalFooterContent);

    // --- 4. If the core step failed, we MUST update the body to reflect that ---
    if (qoderRunOutcome === 'failure') {
      core.error("The qoder-run step failed. Overwriting body with failure message.");
      const failureBodyContent = `❌ **Analysis Step Failed**\n\nAn unexpected error occurred in the analysis step. Please review the [action logs](${checkRunUrl}) for detailed error messages.`;
      currentBody = updateSection(currentBody, 'BODY', failureBodyContent);
    }

    // --- 5. Update the comment on GitHub ---
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
