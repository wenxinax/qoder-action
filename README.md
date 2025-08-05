# Qoder Action

**一个由 Qoder CLI 驱动的、具备自主交互能力的智能 AI 代码助手。**

这个 GitHub Action 利用 AI 的强大能力来分析您的拉取请求（Pull Request）。它不再仅仅是运行一个脚本，而是作为一个智能代理，能够自主地在 PR 时间线中发布代码评审、建议和更新，提供无缝的交互体验。

---

## 工作原理

当被触发时，Action 的工作流程如下：

1.  **创建状态评论**: Action 首先会在 PR 中创建一个“状态评论”，用于追踪整个任务的生命周期。这个评论被巧妙地分成了三个部分：页眉（Header）、正文（Body）和页脚（Footer）。

    > **初始状态**
    > 👋 Hello! I'm Qoder, your AI code assistant.
    > 
    > ---
    > 
    > ⏳ I'm currently analyzing this pull request. I will post my findings directly in the PR thread.
    > 
    > ---
    > 
    > *You can view the live progress in the [action logs](...)*

2.  **自主代码评审**: 随后，核心的 `qoder-cli` 工具会接管任务。它会利用内置的 MCP Server **自主地**将代码评审、建议等内容作为**独立的、新的评论**发布到 PR 中。并且把任务进展更新到状态评论中。

3.  **更新最终状态**: 最后，无论 `qoder-cli` 执行成功与否，Action 的 `finalize` 步骤都会执行。它**只会更新**最初那条“状态评论”的**页脚（Footer）**，标志着整个工作流的结束，而不会覆盖 `qoder-cli` 可能已经发布的任何结果。

    > **最终状态**
    > 👋 Hello! I'm Qoder, your AI code assistant.
    > 
    > ---
    > 
    > ⏳ Plan and Result
    > 
    > ---
    > 
    > *Workflow finished. You can view the full execution details in the [action logs](...)*

## 如何使用

在你的项目中创建 `.github/workflows/qoder-auto-review.yml` 文件，并填入以下内容。

```yaml
name: "Qoder Auto Review"

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  auto-review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - name: "Checkout"
        uses: actions/checkout@v4

      - name: "Run Qoder Action"
        uses: wenxinax/qoder-action@main 
        with:
          trigger_on: "event"
          dashscope_api_key: ${{ secrets.DASHSCOPE_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          prompt: |
            Please review this pull request and provide comprehensive feedback.

            Focus on:
            - Code quality and best practices
            - Potential bugs or issues
            - Performance considerations
            - Security implications
            - Test coverage
            - Documentation updates if needed

            Provide constructive feedback with specific suggestions for improvement.
            Use inline comments to highlight specific areas of concern.
            Please use Chinese to answer.
```

**重要提示：**

- **权限配置**: 为了让 Action 能成功发布评论和 Review，你必须在 workflow 中添加 `permissions` 并授予 `pull-requests: write` 和 `issues: write` 权限。
- **密钥配置**: 你必须在你的 GitHub 仓库的 `Settings` -> `Secrets and variables` -> `Actions` 中创建一个名为 `DASHSCOPE_API_KEY` 的 `Repository secret`。

## 输入参数

| 参数名              | 描述                                                                 | 是否必须 | 默认值         |
| ------------------- | -------------------------------------------------------------------- | -------- | -------------- |
| `trigger_on`        | 定义触发机制。必须是 `mention` (评论提及) 或 `event` (事件触发) 之一。 | `true`   |                |
| `mention_phrase`    | 当 `trigger_on` 为 `mention` 时，在评论中需要匹配的短语。            | `false`  | `@qoder`       |
| `prompt`            | 提供给 AI 的高级指令。                                               | `false`  |                |
| `dashscope_api_key` | 用于 Qoder 服务的身份验证令牌 (Dashscope API Key)。                  | `true`   |                |
| `github_token`      | 用于执行 GitHub API 操作的令牌。                                     | `false`  | `${{ github.token }}` |
| `timeout_minutes`   | Action 执行的超时时间（分钟）。                                      | `false`  | `60`           |

## 设计理念

本项目采用分层设计，将整体功能拆分为两个独立的 Action：`qoder-action` (主 Action) 和 `qoder-core-action` (核心 Action)，各自承担不同的职责。

- **`qoder-action` (编排层)**: 作为用户工作流的直接入口，负责整个流程的编排和调度，如处理 GitHub 事件、创建和更新初始的状态评论、准备 Docker 环境和生成传递给核心引擎的配置文件。

- **`qoder-core-action` (执行引擎)**: 封装了所有与 `qoder-cli` 相关的核心任务。它是一个纯粹的“执行器”，接收配置文件并运行 CLI，不关心任何上层的业务逻辑。

本项目使用 `git subtree` 来管理 `qoder-core-action`。这使得我们可以在主仓库中进行统一开发，同时能将核心 Action 作为一个独立的仓库发布，供其他高阶用户复用。

## 贡献

欢迎各种形式的贡献！你可以提交 Pull Request，或者创建一个 Issue 来讨论任何改进建议。