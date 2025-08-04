# Qoder Action

[![Qoder Action CI](https://github.com/your-org/qoder-action/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/qoder-action/actions/workflows/ci.yml)

一个由 Qoder CLI 驱动的智能代码助手。您可以将此 Action 配置为在 Pull Request 上自动运行，或通过评论中的关键词手动触发。

---

## 功能特性

- **🤖 智能代码助手**: 将您的 Qoder CLI 的强大能力直接集成到 GitHub 工作流中。
- **⚡️ 事件驱动自动化**: 在 Pull Request 创建或更新时，自动触发代码审查、分析或任何自定义任务。
- **🗣️ 交互式触发**: 在 PR 或 Issue 的评论中，通过特定关键词按需唤醒 Qoder。
- **🧩 可组合架构**: 为大多数场景提供了一个开箱即用的高级 Action，同时为高级工作流提供了一个独立的、可复用的 `qoder-core-action`。

## 架构概览

本项目遵循现代化的、健壮的架构设计，通过“关注点分离”原则确保了代码的清晰性和可维护性：

- **`qoder-action` (主 Action)**: 主要面向用户，负责处理所有与 GitHub 环境的交互。
  - `src/dispatcher.ts`: 解析 GitHub 事件，并将任务“分发”给核心 Action。
  - `src/finalize.ts`: 获取核心 Action 的执行结果，并将其“报告”回 GitHub (例如，发表评论)。
- **`qoder-core-action` (核心 Action)**: 一个完全独立的、可复用的 Action，它封装了运行 Qoder CLI 的核心逻辑，与 GitHub 上下文完全隔离。

这种设计使得开发迭代快速可靠，并为用户提供了极大的灵活性。

---

## 使用方法

根据您的需求，主要有两种使用 Qoder Action 的方式。

### 1. 自动化 PR 审查 (事件触发)

这是在每个新 Pull Request 上获得自动化代码分析的推荐方式。

在您的仓库中创建一个工作流文件 (例如 `.github/workflows/qoder-review.yml`):

```yaml
name: "Qoder 自动审查"

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  auto-review:
    runs-on: ubuntu-latest
    steps:
      - name: "运行 Qoder 自动审查"
        uses: your-org/qoder-action@v1
        with:
          # 在 PR 事件上自动触发
          trigger_on: "event"

          # 提供给 Qoder 模型的指令
          prompt: "请对这个 Pull Request 进行一次彻底的代码审查。"

          # 必需的机密信息
          qoder_token: ${{ secrets.QODER_TOKEN }}
          github_token: ${{ secrets.GITHUB_TOKEN }} # 或自定义的 PAT
```

### 2. 交互式问答 (关键词触发)

使用此方法，可以在任何 PR 或 Issue 的评论中按需调用 Qoder。

创建一个工作流文件 (例如 `.github/workflows/qoder-mention.yml`):

```yaml
name: "Qoder 关键词触发"

on:
  issue_comment:
    types: [created]

jobs:
  qoder-response:
    runs-on: ubuntu-latest
    steps:
      - name: "运行 Qoder 助手"
        uses: your-org/qoder-action@v1
        with:
          # 仅在评论包含特定短语时触发
          trigger_on: "mention"

          # 可选：自定义触发短语
          mention_phrase: "@qoder"

          # 必需的机密信息
          qoder_token: ${{ secrets.QODER_TOKEN }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

现在，只需在任何 Issue 或 PR 中发表类似 `@qoder 请解释一下这个函数` 的评论，即可触发此 Action。

---

## 高级用法: 使用核心 Action

对于需要构建自己独特工作流逻辑的高级用户，可以直接使用 `qoder-core-action`。这让您可以完全控制如何生成 prompt 以及如何处理返回结果。

```yaml
- name: "运行 Qoder 核心引擎"
  id: qoder-run
  uses: your-org/qoder-action/qoder-core-action@v1
  with:
    qoder_token: ${{ secrets.QODER_TOKEN }}
    prompt_file_path: "path/to/your/generated-prompt.txt"

- name: "处理核心引擎的输出"
  run: |
    echo "Qoder 已完成运行，结果如下:"
    cat ${{ steps.qoder-run.outputs.result_content }}
```

## 输入参数

### `qoder-action` (主 Action)

| 参数名           | 描述                                                     | 是否必需 | 默认值   |
| ---------------- | -------------------------------------------------------- | -------- | -------- |
| `trigger_on`     | 定义触发机制: `mention` 或 `event`。                     | `true`   |          |
| `mention_phrase` | 当 `trigger_on` 为 `mention` 时，要监听的触发短语。      | `false`  | `@qoder` |
| `prompt`         | 给 Qoder 的指令。当 `trigger_on` 为 `event` 时必需。     | `false`  |          |
| `qoder_token`    | 用于认证 Qoder 服务的令牌。                              | `true`   |          |
| `github_token`   | 用于 GitHub API 操作的令牌。                             | `false`  | `${{ github.token }}` |
| `timeout_minutes`| Action 执行的超时时间（分钟）。                          | `false`  | `60`     |

### `qoder-core-action`

| 参数名             | 描述                                         | 是否必需 | 默认值 |
| ------------------ | -------------------------------------------- | -------- | ------ |
| `qoder_token`      | 用于认证 Qoder 服务的令牌。                  | `false`  |        |
| `prompt_file_path` | 包含 prompt 内容的文件的路径。               | `true`   |        |

## 开发

本项目使用 `npm` 进行依赖管理，使用 `ncc` 进行 TypeScript 编译。

1.  **安装依赖**: `npm install`
2.  **修改代码**: 在 `src/` 或 `qoder-core-action/` 目录中进行修改。
3.  **构建代码**: `npm run build`
4.  **提交代码**: 提交所有改动，**包括 `dist/` 目录中新生成的文件**。
