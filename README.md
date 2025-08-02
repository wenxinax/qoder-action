# Qoder Action

A GitHub Action that demonstrates interactive PR/Issue operations.


# Usage
```yaml
name: 'Qoder Action Example'

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  qoder-interaction:
    runs-on: ubuntu-latest
    name: Run Qoder Interactive Action
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        
      - name: Run Qoder Action
        uses: wenxinax/qoder-action@main
        with:
          user-input: 'Hello from GitHub Action!'
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

# Architecture

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

