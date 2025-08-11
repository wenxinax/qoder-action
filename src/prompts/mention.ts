import { PullRequest, Issue } from '@octokit/webhooks-types';

// A type to represent the context of a mention, which can be either a PR or an Issue.
export type MentionContext = {
  type: 'pr' | 'issue';
  source: PullRequest | Issue;
  owner: string;
  repo: string;
  // The full comment thread, if the mention was in a reply.
  thread?: any[];
  code_context?: {
    path: string;
    diff_hunk: string;
    start_line?: number;
    line: number;
  };
};

export function getMentionSystemPrompt(): string {
  return `
你是一个集成在 GitHub 中的 AI 助手 Qoder。你正在一个 Pull Request 或 Issue 的评论中被用户 @提及。

系统已经预先发送了一条状态评论到github，这是你与用户实时交互的唯一窗口。请使用 qoder-github-mcp-server_qoder_update_comment 更新状态评论。

你的任务是：
- 仔细理解用户在评论中提出的问题或请求。
- 列出详细的任务计划，并且使用 qoder-github-mcp-server_qoder_update_comment 实时更新你的任务进展和结果。
- 你可以调用工具来获取当前pr或者issue的上下文信息,然后结合整个对话线程和相关的 Pull Request 或 Issue 的上下文（包括标题、描述、代码变更），提供一个有帮助、准确且友好的回复。
- 如果用户在寻求代码建议，请提供清晰的代码示例。
`;
}

export function getMentionUserPrompt(
  context: MentionContext,
  commentBody: string,
  appendPrompt?: string
): string {

  const contextDetails = context.type === 'pr' 
    ? `
### Pull Request 信息
- **Owner**: ${context.owner}
- **Repo**: ${context.repo}
- **Pull Number**: ${context.source.number}
- **标题**: ${(context.source as PullRequest).title}
- **作者**: @${context.source.user.login}
- **描述**:
${context.source.body || 'No description provided.'}
`
    : `
### Issue 信息
- **Owner**: ${context.owner}
- **Repo**: ${context.repo}
- **Issue Number**: ${context.source.number}
- **标题**: ${(context.source as Issue).title}
- **作者**: @${context.source.user.login}
- **描述**:
${context.source.body || 'No description provided.'}
`;

  const threadDetails = context.thread && context.thread.length > 0
    ? `
### 对话线程上下文
${context.thread.map(c => `- @${c.user.login}: ${c.body}`).join('\n')}
`
    : '';

  const codeContextDetails = context.code_context
    ? `
### 代码上下文
- **文件**: ${context.code_context.path}
- **行号**: ${context.code_context.start_line ? `${context.code_context.start_line}-` : ''}${context.code_context.line}
- **代码片段**:
` + '```diff' + `
${context.code_context.diff_hunk}
` + '```' + `
`
    : '';

  const userInstruction = `
有用户在一个 ${context.type === 'pr' ? 'Pull Request' : 'Issue'} 的评论中提及了你。

以下是相关的上下文信息：
${contextDetails}
${codeContextDetails}
${threadDetails}

### 用户最新评论
用户在评论中写道：
"""
${commentBody}
"""

请根据你的角色定位以及上述所有上下文，对用户的评论做出回应。

${appendPrompt ? `
另外，请根据以下用户的额外要求来调整你的回复风格或内容：
${appendPrompt}
` : ''}
`;
  return userInstruction;
}