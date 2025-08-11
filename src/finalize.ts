import * as core from '@actions/core';
import * as github from '@actions/github';

// Helper function to update a section of the comment
// This is preserved from the original file.
function updateSection(originalBody: string, section: 'HEADER' | 'BODY' | 'FOOTER', newContent: string): string {
  const startMarker = `<!-- QODER_${section}_START -->`;
  const endMarker = `<!-- QODER_${section}_END -->`;

  const startIndex = originalBody.indexOf(startMarker);
  const endIndex = originalBody.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    core.warning(`Could not find markers for section ${section}. The comment might not be updated as expected.`);
    const separator = '\n\n---\n\n';
    if (section === 'BODY') return `${originalBody}${separator}${newContent}`;
    return originalBody;
  }

  const before = originalBody.substring(0, startIndex + startMarker.length);
  const after = originalBody.substring(endIndex);

  return `${before}\n${newContent}\n${after}`;
}

async function run(): Promise<void> {
  try {
    // 1. Get Inputs using the standard core.getInput() 
    const githubToken = core.getInput('github_token', { required: true });
    const commentIdStr = core.getInput('comment_id');
    const jobStatus = core.getInput('job_status', { required: true });
    const scene = core.getInput('scene', { required: true });
    const qoderResult = core.getInput('qoder_result');

    if (!commentIdStr) {
      core.info("No comment_id provided, skipping finalization.");
      return;
    }
    const commentId = parseInt(commentIdStr, 10);

    const octokit = github.getOctokit(githubToken);
    const context = github.context;
    const pr = context.payload.pull_request;

    if (!pr) {
      throw new Error("Finalize step must be run in the context of a pull_request.");
    }

    // 2. Fetch the existing comment
    core.info(`Fetching existing comment with ID: ${commentId}`);
    const { data: existingComment } = await octokit.rest.issues.getComment({
      ...context.repo,
      comment_id: commentId,
    });
    let currentBody = existingComment.body || '';

    // 3. Determine the final state and content
    let bodyContent: string | null = null;
    let footerContent: string;

    if (jobStatus === 'failure' || jobStatus === 'cancelled') {
      const status = jobStatus === 'failure' ? 'failed' : 'cancelled';
      bodyContent = `❌ **The AI task for the `${scene}` scene has ${status}.**\n\nPlease review the [action logs](${pr.html_url}/checks?check_run_id=${context.runId}) for details.`;
      footerContent = `*Workflow ${status}.*`;
    } else {
      footerContent = `*Workflow finished successfully. You can view the full execution details in the [action logs](${pr.html_url}/checks?check_run_id=${context.runId}).*`;

      if (scene === 'cr') {
        const reviewBody = qoderResult || 'No review summary was provided.';
        const fixContext = {
          repo: context.repo.repo,
          owner: context.repo.owner,
          prNumber: pr.number,
          prompt: `Based on the following code review for pull request #${pr.number}, please fix the identified issues.\n\n**PR Title**: ${pr.title}\n\n---\n\n**Review Summary**:\n${reviewBody}`
        };
        const base64Context = Buffer.from(JSON.stringify(fixContext)).toString('base64');
        const fixUrl = `http://localhost:9080/reload-to-qoder?context=${base64Context}`;
        footerContent += `\n\n[✨ One-Click Qoder Fix](${fixUrl})`;
      }
    }

    // 4. Update the comment sections
    if (bodyContent) {
      currentBody = updateSection(currentBody, 'BODY', bodyContent);
    }
    currentBody = updateSection(currentBody, 'FOOTER', footerContent);

    // 5. Update the comment on GitHub
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