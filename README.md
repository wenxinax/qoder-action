# Qoder Action

Turn your GitHub repository into an intelligent workspace with **Qoder**. This action seamlessly integrates Qoder's intelligent capabilities into your development workflow, enabling automated code reviews, interactive debugging, and custom autonomous tasks powered by `qodercli`.

## Features

- **🤖 Intelligent Code Reviews**: Automatically analyze Pull Requests for bugs, security vulnerabilities, and code style issues before they merge.
- **💬 Interactive Development**: Collaborate with `@qoder` directly in Issues and Pull Requests to explain code, refactor logic, or generate tests via chat.
- **🧠 Context-Aware**: Inject project-specific knowledge (architecture, conventions) simply by adding an `Agents.md` file to your repository.
- **🧩 Highly Extensible**: Define custom **Subagents** and **Slash Commands** to create tailored workflows that match your team's unique processes.
- **⚡ Pipeline Ready**: Built for CI/CD with structured stream-json outputs, enabling seamless integration with other tools and scripts.

## Quick Start

> **Tip**: If you have `qodercli` installed locally, you can run **`/setup-github`** in the TUI to guide you through the entire setup.

Get started with Qoder in your repository in just a few minutes:

### 1. Setup Integration & Get Token

1. Go to [https://qoder.com/account/integrations](https://qoder.com/account/integrations).
2. Connect your Qoder account with GitHub and install the **qoderai** GitHub App to your target repository.
3. Generate a new **Personal Access Token**.

### 2. Add it as a GitHub Secret

Store your token as a secret named `QODER_PERSONAL_ACCESS_TOKEN` in your repository:

- Go to your repository's **Settings > Secrets and variables > Actions**.
- Click **New repository secret**.
- Name: `QODER_PERSONAL_ACCESS_TOKEN`
- Value: *Your generated token*

### 3. Select & Install Workflows

Browse the [`examples/`](./examples/) directory to choose a workflow that fits your needs, then copy it to your repository's `.github/workflows/` directory.

| Workflow | Description | Source |
| :--- | :--- | :--- |
| **Code Review** | Automatically analyzes Pull Requests for code quality and security. | [`code-review.yml`](./examples/code-review.yml) |
| **Assistant** | Enables interactive chat (`@qoder`) in Issues and PRs to explain code or fix bugs. | [`assistant.yml`](./examples/assistant.yml) |

> **Note**: These examples are just the beginning. You can craft powerful, custom workflows by combining Qoder's capabilities with your own logic. Contributions of new workflow examples are welcome!

### 4. Try it out!

- **Code Review**: Open a new Pull Request and wait for Qoder's feedback.
- **Assistant**: Comment `@qoder Explain this code` or `@qoder Fix this bug` on any Issue or PR.

## Configuration Reference

### Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `prompt` | Instructions for `qodercli` (passed to `-p` flag). | **Yes** | - |
| `qoder_personal_access_token` | Your Qoder Personal Access Token. | **Yes** | - |
| `flags` | Additional CLI arguments for `qodercli`. | No | `''` |
| `qodercli_version` | Version of `qodercli`. Default version recommended. | No | (Latest Compatible) |
| `enable_qoder_github_mcp` | Enable qoder-github MCP Server. Required for built-in resources. | No | `true` |


### Secrets

| Name | Description | Required |
|------|-------------|----------|
| `QODER_PERSONAL_ACCESS_TOKEN` | Your Qoder Personal Access Token. | **Yes** |

### Outputs

This action provides outputs that can be consumed by subsequent steps in your workflow.

| Name | Description |
|------|-------------|
| `output_file` | Path to a file containing the full `stdout` from `qodercli`. The content is formatted as **stream-json** (line-delimited JSON objects), making it machine-readable for custom post-processing scripts. |
| `error` | Captures the standard error (stderr) output if the execution encounters issues. |

### Authentication

This action uses OpenID Connect (OIDC) to securely authenticate with Qoder services. Ensure your workflow has the `id-token: write` permission.

## Customization

Beyond standard configuration, you can deeply customize Qoder's behavior and knowledge base.

### Context Injection
Simply add an `Agents.md` file to your repository. Qoder automatically detects and loads this file into its context. Use this to provide:
- Project-specific coding conventions.
- Architectural overviews.
- Domain-specific terminology.
- Guidelines you want Qoder to follow in every interaction.

### Extensions
We encourage customizing Qoder's behavior using **Subagents** and **Slash Commands**. By defining these in your repository's `.qoder/` directory, you can create structured, persona-based workflows tailored to your project's specific needs.

For detailed documentation on creating subagents and commands, please refer to the [Qoder CLI Documentation](https://docs.qoder.com/cli/using-cli#subagent).

## Recipes & Best Practices

Explore our [Recipes Guide](./docs/recipes.md) for a collection of ready-to-use configurations, including advanced filtering, cost optimization, and language customization.

## Contributing

Contributions are welcome! Whether you're fixing a bug, adding a new [workflow example](./examples/), or improving documentation, we'd love to see your PRs.

Please feel free to open an [Issue](../../issues) if you encounter any problems or have feature requests.

## License

This project is licensed under the [MIT License](./LICENSE).
