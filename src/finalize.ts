import * as core from '@actions/core';
import * as github from '@actions/github';

// Helper function to update a section of the comment
function updateSection(originalBody: string, section: 'HEADER' | 'BODY' | 'FOOTER', newContent: string): string {
  const startMarker = `<!-- QODER_${section}_START -->`;
  const endMarker = `<!-- QODER_${section}_END -->`;

  const startIndex = originalBody.indexOf(startMarker);
  const endIndex = originalBody.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    core.warning(`Could not find markers for section ${section}.`);
    // If markers are not found, for BODY, we replace the whole content.
    if (section === 'BODY') {
      return newContent;
    }
    return originalBody; // Return original body if markers are not found for other sections
  }

  const before = originalBody.substring(0, startIndex + startMarker.length);
  const after = originalBody.substring(endIndex);

  return `${before}\n${newContent}\n${after}`;
}

async function run(): Promise<void> {
  try {
    const githubToken = core.getInput('github_token', { required: true });
    const commentIdStr = core.getInput('comment_id');
    const jobStatus = core.getInput('job_status', { required: true });
    const scene = core.getInput('scene', { required: true });
    const qoderResult = core.getInput('qoder_result') || '';

    if (!commentIdStr) {
      core.info("No comment_id provided, skipping finalization.");
      return;
    }
    const commentId = parseInt(commentIdStr, 10);

    const octokit = github.getOctokit(githubToken);
    const context = github.context;
    const pr = context.payload.pull_request;
    const issue = context.payload.issue;

    const source = pr || issue;
    if (!source) {
      throw new Error("Finalize step must be run in the context of a pull_request or issue.");
    }

    const commentType = core.getInput('comment_type');

    let currentBody: string;

    if (commentType === 'review') {
      const { data: existingComment } = await octokit.rest.pulls.getReviewComment({
        ...context.repo,
        comment_id: commentId,
      });
      currentBody = existingComment.body || '';
    } else {
      const { data: existingComment } = await octokit.rest.issues.getComment({
        ...context.repo,
        comment_id: commentId,
      });
      currentBody = existingComment.body || '';
    }

    let bodyContent: string | null = null;
    let footerContent: string;
    const checkRunUrl = `${source.html_url}/checks?check_run_id=${context.runId}`;

    if (jobStatus === 'failure' || jobStatus === 'cancelled') {
      const status = jobStatus === 'failure' ? 'failed' : 'cancelled';
      bodyContent = `❌ **The AI task for the '${scene}' scene has ${status}.**\n\nPlease review the [action logs](${checkRunUrl}) for details.`;
      footerContent = `*Workflow ${status}.*`;
    } else {
      footerContent = `*Workflow finished successfully. You can view the full execution details in the [action logs](${checkRunUrl}).*`;

      // For mention scene, the body is the result itself.
      if (scene === 'mention') {
        bodyContent = qoderResult;
      }
    }

    if (bodyContent) {
      currentBody = updateSection(currentBody, 'BODY', bodyContent);
    }
    currentBody = updateSection(currentBody, 'FOOTER', footerContent);

    if (commentType === 'review') {
      await octokit.rest.pulls.updateReviewComment({
        ...context.repo,
        comment_id: commentId,
        body: currentBody,
      });
    } else {
      await octokit.rest.issues.updateComment({
        ...context.repo,
        comment_id: commentId,
        body: currentBody,
      });
    }

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