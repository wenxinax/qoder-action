import * as core from "@actions/core";
import * as github from "@actions/github";

async function run(): Promise<void> {
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    const commentId = process.env.COMMENT_ID;
    let resultContent = process.env.RESULT_CONTENT || "";
    const runId = process.env.RUN_ID;
    const qoderResultType = process.env.QODER_RESULT_TYPE || 'error'; // Default to error

    if (!githubToken) {
      throw new Error("GITHUB_TOKEN is required but not provided.");
    }
    if (!commentId) {
      core.info("No comment ID provided, skipping comment update.");
      return;
    }

    const octokit = github.getOctokit(githubToken);
    const context = github.context;
    const pr = context.payload.pull_request;

    if (!pr) {
      throw new Error("Pull request payload is missing.");
    }

    const checkRunUrl = `${pr.html_url}/checks?check_run_id=${runId}`;
    let finalCommentBody = '';

    if (qoderResultType !== 'success') {
      core.error(`The qoder-run step did not succeed. Result type: ${qoderResultType}. Reporting a failure comment.`);
      finalCommentBody = `❌ **Qoder Analysis Failed**

An error occurred during the analysis process.

Please review the [action logs](${checkRunUrl}) for detailed error messages and diagnostics.`;
    } else {
      core.info("The qoder-run step succeeded. Reporting a success comment.");
      if (!resultContent) {
        core.warning("Result content is empty, but the result type was success.");
        resultContent = `Analysis completed successfully, but no specific feedback was generated.`;
      }

      finalCommentBody = `✅ **Qoder Analysis Complete**

Here are the results of the analysis:

---

${resultContent}

---

*You can view the full execution details in the [action logs](${checkRunUrl}).*`;
    }

    core.info("Updating comment with final results...");
    await octokit.rest.issues.updateComment({
      ...context.repo,
      comment_id: parseInt(commentId, 10),
      body: finalCommentBody,
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
