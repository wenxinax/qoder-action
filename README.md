# Qoder Action

**一个由 Qoder CLI 驱动的智能 AI 代码助手。**

这个 GitHub Action 利用 AI 的强大能力来分析您的拉取请求（Pull Request）。它可以通过 PR 事件（如创建或同步）自动触发，并将分析反馈直接发布在 PR 的评论区中。

---

## 工作原理

当被触发时，Qoder Action 会执行以下步骤：

1.  **调度任务**: 它首先会在 PR 下发布一条友好的评论，通知您分析已经开始。这条评论包含一个指向 GitHub Actions 运行日志的实时链接。

    > 👋 你好！我是 Qoder，你的 AI 代码助手。
    >
    > 我正在分析这个 Pull Request，这可能需要一些时间。
    >
    > 你可以点击[这里](<pr_url>/checks?check_run_id=<run_id>)查看实时分析进度。
    >
    > 我会将分析结果更新在这条评论下方。

2.  **执行分析**: 接着，它会运行 `qoder-cli` 工具，并将 PR 的详细信息（标题、描述、代码变更）和你自定义的指令（Prompt）提供给 AI。

3.  **报告结果**: 分析完成后，Action 会更新最初的评论，将 AI 生成的结果清晰地展示出来。

    > ✅ **Qoder 分析完成**
    >
    > 以下是本次分析的结果：
    >
    > ---
    >
    > *AI 生成的代码评审和改进建议将显示在这里。*
    >
    > ---
    >
    > *你可以点击[这里](<pr_url>/checks?check_run_id=<run_id>)查看完整的任务执行日志。*

## 如何使用

要在你的工作流程中使用此 Action，请在你的代码仓库中创建如下的 workflow 文件。

### 工作流示例

在你的项目中创建 `.github/workflows/qoder-auto-review.yml` 文件，并填入以下内容。这个工作流会在每次有新的 PR 或 PR 更新时自动触发 AI 代码评审。

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

      - name: "Run Qoder Auto Review"
        uses: wenxinax/qoder-action@main
        with:
          trigger_on: "event"
          dashscope_api_key: ${{ secrets.DASHSCOPE_API_KEY }}
          prompt: |
            请仔细审查这个 pull request，并提供全面的反馈。

            请重点关注以下方面：
            - 代码质量和最佳实践
            - 潜在的 bug 或问题
            - 性能考量
            - 安全隐患
            - 测试覆盖率
            - 是否需要更新文档

            请提供建设性的反馈和具体的改进建议。
            如果可能，请使用行内评论来指出具体的问题代码。
            请使用中文回答。
```

为了让此 Action 正常工作，你必须在你的 GitHub 仓库中配置 `DASHSCOPE_API_KEY`。请前往你的仓库页面，在 `Settings` -> `Secrets and variables` -> `Actions` 中创建一个新的 `Repository secret`，名称为 `DASHSCOPE_API_KEY`，并将你的 Dashscope API Key 作为其值。

## 输入参数

你可以使用以下输入参数来配置此 Action：

| 参数名              | 描述                                                                 | 是否必须 | 默认值         |
| ------------------- | -------------------------------------------------------------------- | -------- | -------------- |
| `trigger_on`        | 定义触发机制。必须是 `mention` (评论提及) 或 `event` (事件触发) 之一。 | `true`   |                |
| `mention_phrase`    | 当 `trigger_on` 为 `mention` 时，在评论中需要匹配的短语。            | `false`  | `@qoder`       |
| `prompt`            | 提供给 AI 的指令。当 `trigger_on` 为 `event` 时此项为必须。          | `false`  |                |
| `dashscope_api_key` | 用于 Qoder 服务的身份验证令牌 (Dashscope API Key)。                  | `true`   |                |
| `github_token`      | 用于执行 GitHub API 操作的令牌。                                     | `false`  | `${{ github.token }}` |
| `timeout_minutes`   | Action 执行的超时时间（分钟）。                                      | `false`  | `60`           |

