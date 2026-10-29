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

## What it does

- One model call per question. The whole conversation goes in as text, with long tool output cut down. No tools, so a btw can never change files.
- Model: your current model, or a picker of your scoped models when you scope more than one.
- Answers come from the conversation first; a little general knowledge is allowed when it helps.
- Past btw's are saved per project in `~/.pi/agent/btw/<project>.jsonl`. Same directory shows the same list after `/new`.

## Install

```bash
pi install git:github.com/maxpaulus43/pi-btw
```

Try it without installing:

```bash
pi -e ./pi-btw
```

## Develop

```bash
npm install
npm test      # history storage tests
npm run check # tsc --noEmit
```
