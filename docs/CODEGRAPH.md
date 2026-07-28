# CodeGraph

CodeGraph is development-only semantic code intelligence. It does not reduce runtime model, image, video, or TTS credits.

Windows setup:

```powershell
irm https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.ps1 | iex
codegraph install
cd <repository-root>
codegraph init
codegraph status
```

Alternative:

```powershell
npm i -g @colbymchenry/codegraph
codegraph install
codegraph init
```

Workflow:

1. Run `codegraph status`.
2. Use `codegraph explore "<precise flow question>"` before broad exploration.
3. After changes, run `codegraph status` and an impact query.
4. Use `git diff --name-only | codegraph affected --stdin` when selecting tests in a git repo.

