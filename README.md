# pi-btw

Ask a side question about the conversation you are in, without interrupting the main agent.

```
/btw what does the retry loop do?
```

A floating window opens over the transcript with the answer. The main agent keeps working.

## Keys

| Key | Does |
|---|---|
| enter | ask the question in the input |
| up / down | look through past btw's |
| page up / page down | scroll the answer |
| scroll wheel | scroll the answer (fullscreen TUI mode) |
| esc | stop the answer, then close the window |

Esc is the only way out: pi's overlay API gives an extension no signal for a click outside its window, so clicking the transcript leaves the window open.

Answers render as markdown, live while they stream.

A finished btw is saved into the session as its own branch, labelled `btw`, forked where you asked it. So `/tree` shows it, and navigating there puts you inside that exchange while the main thread kept its own path.

## What it does

- One model call per question. The whole conversation goes in as text, with long tool output cut down. No tools, so a btw can never change files.
- Model: your current model, or a picker of your scoped models when you scope more than one.
- Answers come from the conversation first; a little general knowledge is allowed when it helps.
- Past btw's of the current session come from the session tree itself, so the up arrow list and `/tree` always agree. `/new` starts an empty list, and a stopped answer (esc before it finishes) is not saved.

## Install

```bash
pi install npm:@maxpaulus/pi-btw
```

Or straight from git:

```bash
pi install git:github.com/maxpaulus43/pi-btw
```

Try a checkout without installing:

```bash
pi -e ./pi-btw
```

## Develop

```bash
npm install
npm test      # history storage tests
npm run check # tsc --noEmit
```

## Release

```bash
npx changelogger install   # once per clone, adds the pre-commit hook
npm version patch
git add -A && git commit -m "Release 0.1.1"
git push
```

The pre-commit hook from `@maxpaulus/changelogger` writes the `CHANGELOG.md` entry for the new version. On push, `.github/workflows/publish.yml` runs the tests and typecheck, publishes to npm with provenance when the version differs from the published one, then tags and creates the GitHub release from that changelog entry.
