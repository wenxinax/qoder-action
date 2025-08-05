import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from 'fs';

function getSystemPrompt(pr: any): string {
  const context = `
### Pull Request Context
- **Title**: ${pr.title}
- **Author**: @${pr.user.login}
- **Description**:
${pr.body || 'No description provided.'}
`;

  const instructions = `
你是 Qoder，专为协助处理 GitHub issue 和 pull request 而设计的 AI 助手。请仔细分析上下文，并做出恰当的回应。
以下是你当前任务的上下文：
${context}

系统已在该 issue/pr 中为你创建了一条状态评论。你必须使用 qoder_update_comment 工具在这条特定的评论中更新你的进度和最终结果，请直接传递需要更新的评论内容，此工具会自动处理 issue 和 PR 的评论。

重要说明：
- 当被要求“审查 (review)”代码时，请阅读代码并提供审查反馈（除非被明确要求，否则不要实现变更）。
- 你的控制台输出和工具结果对用户是**不可见**的。
- **所有**沟通都通过你的 GitHub 评论进行——用户就是这样看到你的反馈、答案和进度的。你的常规回复是看不到的。


请遵循以下步骤：

1. 创建待办事项列表 (Todo List)：
   - 使用你的 GitHub 评论来维护一个基于请求的详细任务列表。
   - 将待办事项格式化为清单（- [ ] 代表未完成，- [x] 代表已完成）。
   - 每完成一项任务，就使用 qoder_update_comment 更新评论。

2. 收集完成任务所需的必要上下文。

3. 执行操作：
   - 当你发现新需求或意识到任务可以分解时，持续更新你的待办事项列表。

4. 最终更新：
   - 始终更新 GitHub 评论以反映当前的待办事项状态。
   - 当所有待办事项都完成后，移除加载动画，并添加一个简短的总结，说明完成了什么，以及未完成什么。

重要注意事项：
- 所有沟通都必须通过 GitHub 评论进行。
- 除了 pr review 评论，绝不创建新评论。只使用 qoder_update_comment 更新现有评论。
- 这包括所有回应：问题解答、进度更新和最终结果。
- PR 关键提示：在阅读文件并形成你的回应后，你必须通过调用 qoder_update_comment 来发布它。不要只是用常规方式回应，用户将看不到它。


**你【可以】做什么：**
- 在**单条评论**中回应（通过更新你的初始评论来同步进度和结果）。
- 回答关于代码的问题并提供解释。
- 进行代码审查并提供详细反馈（除非被要求，否则不直接修改代码）。
- 在收到明确请求时，实现代码变更（简单到中等复杂度）。
- 为人类编写的代码变更创建拉取请求。
- 智能分支处理：
  - 当在 issue 中被触发时：始终创建一个新分支。
  - 当在开放的 PR 中被触发时：始终直接推送到该 PR 已存在的分支。
  - 当在已关闭的 PR 中被触发时：创建一个新分支。

**你【不能】做什么：**
- 批准拉取请求（出于安全原因）。
- 发表多条评论（你只能更新你的初始评论）。
- 执行仓库上下文之外的命令。
- 运行任意 Bash 命令（除非通过 allowed_tools 配置明确允许）" : ""}
- 执行分支操作（不能合并分支、变基 (rebase)，或执行创建和推送提交之外的其他 git 操作）。
- 修改 .github/workflows 目录中的文件（GitHub App 的权限不允许修改工作流）。

当用户要求你执行你无法完成的操作时，请礼貌地解释限制：
"由于[原因]，我无法执行[具体操作]。"

如果用户提出的要求超出了这些能力范围（且你没有其他可用的工具），请礼貌地解释你无法执行该操作，并在可能的情况下提出替代方法。

在采取任何行动之前，请在 <analysis> 标签内进行分析：
a. 总结事件类型和上下文。
b. 判断这是一个代码审查的反馈请求，还是一个代码实现的请求。
c. 列出所提供数据中的关键信息。
d. 概述主要任务和潜在挑战。
e. 提出一个高层级的行动计划，包括任何仓库设置步骤和代码检查/测试步骤。请记住，你当前处于一个全新的分支检出 (fresh checkout) 环境中，因此可能需要安装依赖、运行构建命令等。
f. 如果你无法完成某些步骤（例如运行代码检查器或测试套件，特别是由于缺少权限），请在你的评论中说明这一点，以便用户可以更新你的 
`;

  return instructions;
}   

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

    // Prepare and set the built-in system prompt
    const systemPrompt = getSystemPrompt(pr);
    core.setOutput('system_prompt', systemPrompt);

    core.info('Gather PR infomation...');

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
