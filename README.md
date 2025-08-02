# Qoder Action MVP

A GitHub Action that demonstrates interactive PR/Issue operations using Composite Actions with Go CLI tool and TypeScript business logic.

## Features

- 🚀 Composite Action architecture for complex business logic
- 🛠️ Go CLI tool for core processing
- 📝 TypeScript for GitHub API interactions
- 💬 Automatic PR comments with greeting messages
- 🎯 Triggered on PR events

## Usage

```yaml
name: 'Your Workflow'
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  your-job:
    runs-on: ubuntu-latest
    steps:
      - uses: your-username/qoder-action@v1
        with:
          user-input: 'Your message here'
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `user-input` | User input parameter to be processed by CLI tool | Yes | - |
| `github-token` | GitHub token for API access | Yes | `${{ github.token }}` |

## Outputs

| Output | Description |
|--------|-------------|
| `result` | JSON result from the business logic execution |

## Development

1. **Build Go CLI:**
   ```bash
   cd cli
   make build
   ```

2. **Install TypeScript dependencies:**
   ```bash
   cd src
   npm install
   ```

3. **Test locally:**
   ```bash
   # Set environment variables
   export USER_INPUT="test message"
   export GITHUB_TOKEN="your-token"
   export GITHUB_CONTEXT='{"event_name":"pull_request"}'
   
   # Run TypeScript logic
   cd src && npm start
   ```

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   GitHub Event  │ -> │ Composite    │ -> │ TypeScript      │
│   (PR opened)   │    │ Action       │    │ Business Logic  │
└─────────────────┘    └──────────────┘    └─────────────────┘
                               │                      │
                               v                      v
                      ┌──────────────┐    ┌─────────────────┐
                      │ Go CLI Tool  │    │ GitHub API      │
                      │ (Processing) │    │ (PR Comment)    │
                      └──────────────┘    └─────────────────┘
```

## License

MIT