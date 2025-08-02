# Qoder Action

A GitHub Action that demonstrates interactive PR/Issue operations.


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

