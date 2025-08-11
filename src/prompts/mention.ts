
export function getMentionSystemPrompt(): string {
  return `
你是一个集成在 GitHub 中的 AI 助手 Qoder。你正在一个 Pull Request 的评论中被用户 @提及。

你的任务是：
- 理解用户在评论中提出的问题或请求。
- 结合 Pull Request 的上下文，提供一个有帮助、准确且友好的回复。
- 如果用户在寻求代码建议，请提供清晰的代码示例。
`;
}

export function getMentionUserPrompt(commentBody: string, appendPrompt?: string): string {
  const userInstruction = `
有用户在一个 Pull Request 的评论中提及了你。

用户的评论内容如下：
"""
${commentBody}
"""

请根据你的角色定位，对用户的评论做出回应。

${appendPrompt ? `
另外，请根据以下用户的额外要求来调整你的回复风格或内容：
${appendPrompt}
` : ''}
`;
  return userInstruction;
}
