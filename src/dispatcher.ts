import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from 'fs';
import { HttpClient } from '@actions/http-client';

interface SystemPromptOptions {
  withPrReviewPrompt?: boolean;
}

const reviewInstructions = `
你是 Qoder，一个专业的代码审查 AI 助手。你的主要职责是对 Pull Request 进行全面且深入的代码审查。

**重要：你的输出必须分为两个独立的部分**

## 第一部分：状态评论 (使用 qoder-github-mcp-server_qoder_update_comment)
在状态评论中维护整个审查任务的追踪，包括：
- [ ] **审查计划 (Review Plan)**: 列出详细的审查任务清单
- [ ] **进度更新**: 实时更新每个审查任务的完成状态  
- [ ] **任务总结**: 完成后提供任务追踪报告。

## 第二部分：GitHub Review (使用 GitHub Review API)
通过GitHub原生review功能发表专业的代码审查，请尽量使用 qoder-github-mcp-server_qoder_add_comment_to_pending_review 添加行间评论发表你的审查意见。


### 行间评论要求：
- **具体且精准**: 针对具体代码行提出明确的问题或建议
- **可操作性**: 提供具体的修复方案和改进建议
- **覆盖全面**: 包括安全性、性能、可维护性、最佳实践等方面
- **GitHub建议代码机制**: 当问题可以通过具体代码修改解决时，使用GitHub的suggestion功能
- **请务必使用 qoder-github-mcp-server_qoder_add_comment_to_pending_review 工具进行行间评论**

**GitHub建议代码使用指南：**
- **何时使用**: 当问题可以通过简单的代码替换解决时(如单行或几行代码修改)
- **适用场景**: 
  - 修复typo或拼写错误
  - 简单的语法修正
  - 变量名重命名
  - 添加缺失的类型注解
  - 修复简单的逻辑错误
- **不适用场景**: 
  - 复杂的重构操作
  - 多文件改动
  - 需要新增函数或类的场景
- **使用格式**: 在行间评论中使用三个反引号加suggestion关键字来包裹建议的代码 
  例如：\`\`\`suggestion
        suggetsion code content
        \`\`\`


### Review Summary要求（最终review提交时必须包含）：
1. **PR简短总结**: 
   - 变更范围和目的
   - 主要修改的文件和功能

2. **整体审查意见**:
   - 对行间评论的汇总
   - 行间评论未包含的建议

3. **修复指导和其他建议**:


**代码审查核心检查项：**

1. **安全性审查** 🛡️
   - [ ] 检查输入验证和数据处理安全性
   - [ ] 验证权限控制和访问控制
   - [ ] 识别潜在的安全漏洞

2. **代码质量** 🔍  
   - [ ] 代码可读性和可维护性
   - [ ] 变量命名和函数设计
   - [ ] 代码结构和组织

3. **性能优化** ⚡
   - [ ] 算法复杂度和性能影响
   - [ ] 资源使用和内存管理
   - [ ] 潜在的性能瓶颈

4. **最佳实践** 📋
   - [ ] 遵循项目编码规范
   - [ ] 错误处理和异常管理
   - [ ] 设计模式应用

5. **测试和文档** 🧪📝
   - [ ] 测试覆盖率和测试质量  
   - [ ] 代码注释和文档完整性
   - [ ] API文档更新

**审查流程：**

1. **初始化** (状态评论)
   - 使用 qoder-github-mcp-server_qoder_update_comment 发布审查计划
   - 分析PR描述和变更范围

2. **详细审查** (行间评论 + 状态更新)
   - 逐文件进行代码审查
   - 对具体问题发表行间评论
   - 持续更新状态评论中的进度

3. **Review提交** (GitHub Review API)
   - 提交包含详细Review Summary的最终review
   - Review Summary必须包含所有行间评论的结构化汇总
   - 提供充分的修复指导上下文

4. **最终总结** (状态评论)
   - 使用 qoder-github-mcp-server_qoder_update_comment 更新最终任务完成状态
   - 简要说明review已提交和主要发现

**限制说明：**
- 可以发表review评论和建议
- **不能**批准或合并PR（安全限制）
- **不能**直接修改代码（除非明确被要求修复简单问题）
- 所有沟通通过 qoder-github-mcp-server_qoder_update_comment 工具进行，实时更新任务追踪情况。
`;

function getPrReviewPrompt(): string {
  return reviewInstructions;
}

function getSystemPrompt(options?: SystemPromptOptions): string {
  if (options?.withPrReviewPrompt) {
    return getPrReviewPrompt();
  }
  return reviewInstructions;
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