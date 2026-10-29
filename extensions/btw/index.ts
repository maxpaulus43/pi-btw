/**
 * /btw - ask a side question about the running conversation.
 *
 * Opens a floating window over the transcript. The main agent keeps working.
 * Each btw is one model call with the conversation as text and no tools, so it
 * can look but never touch. Past btw's are kept per project.
 */

import { join } from "node:path";
import { type Model, uuidv7, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, SessionEntry, Theme } from "@earendil-works/pi-coding-agent";
import {
	convertToLlm,
	getAgentDir,
	getMarkdownTheme,
	serializeConversation,
} from "@earendil-works/pi-coding-agent";
import {
	type Focusable,
	Input,
	Markdown,
	matchesKey,
	type TUI,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { appendHistory, type BtwEntry, loadHistory, projectSlug } from "./store.ts";

const SYSTEM_PROMPT = `You answer side questions about a conversation another agent is having with a user. You see that conversation as text. You have no tools and you do not continue the main task.

Answer only the question. Keep it short: a few sentences or a short list. Take facts from the conversation first. Add a little general knowledge when it helps, and say what came from outside the conversation. If the conversation has nothing useful, still answer in one line.`;

/** Conversation as text. Tool output is truncated by the serializer. */
function conversationText(entries: SessionEntry[]): string {
	const messages = entries.flatMap((entry) => {
		if (entry.type === "message") return [entry.message];
		if (entry.type === "compaction") {
			return [
				{
					role: "compactionSummary" as const,
					summary: entry.summary,
					tokensBefore: entry.tokensBefore,
					timestamp: new Date(entry.timestamp).getTime(),
				},
			];
		}
		return [];
	});
	return serializeConversation(convertToLlm(messages));
}

/** Scoped models only. Lone scope or no scope skips the picker. */
async function pickModel(ctx: ExtensionCommandContext): Promise<Model<any> | undefined> {
	const scoped = ctx.scopedModels;
	if (scoped.length === 0) return ctx.model;
	if (scoped.length === 1) return scoped[0]!.model;

	const labels = scoped.map((s) => `${s.model.provider}/${s.model.id}`);
	const picked = await ctx.ui.select("btw model", labels);
	const index = picked ? labels.indexOf(picked) : -1;
	return index >= 0 ? scoped[index]!.model : undefined;
}

interface Options {
	ctx: ExtensionCommandContext;
	model: Model<any>;
	file: string;
	conversation: string;
	entries: BtwEntry[];
	initial?: string;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("btw", {
		description: "Ask a side question about this conversation in a floating window",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/btw needs the interactive terminal UI", "error");
				return;
			}

			const model = await pickModel(ctx);
			if (!model) {
				ctx.ui.notify("No model available for /btw", "error");
				return;
			}

			const file = join(getAgentDir(), "btw", `${projectSlug(ctx.cwd)}.jsonl`);
			const options: Options = {
				ctx,
				model,
				file,
				conversation: conversationText(ctx.sessionManager.getBranch()),
				entries: loadHistory(file),
				initial: args.trim() || undefined,
			};

			await ctx.ui.custom<void>(
				(tui, theme, _keybindings, done) => new BtwWindow(tui, theme, done, options),
				{ overlay: true, overlayOptions: { width: "70%", minWidth: 44, maxHeight: "80%", margin: 1 } },
			);
		},
	});
}

class BtwWindow implements Focusable {
	private readonly input: Input;
	/** Renders the shown answer as markdown. */
	private readonly markdown = new Markdown("", 0, 0, getMarkdownTheme());
	private markdownText = "";
	/** Which entry is shown. -1 when there is nothing yet. */
	private view: number;
	/** Lines scrolled up from the newest line. 0 follows the stream. */
	private scroll = 0;
	private maxScroll = 0;
	private pageSize = 1;
	private abort?: AbortController;
	private isFocused = false;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly done: () => void,
		private readonly options: Options,
	) {
		this.input = new Input({
			prompt: "❯ ",
			placeholder: "btw question",
			placeholderStyle: (text) => theme.fg("dim", text),
		});
		this.input.onSubmit = (text) => {
			const question = text.trim();
			if (question) void this.ask(question);
		};
		this.input.onEscape = () => this.escape();
		this.view = options.entries.length - 1;
		if (options.initial) {
			const initial = options.initial;
			this.input.setValue(initial);
			queueMicrotask(() => void this.ask(initial));
		}
	}

	get focused(): boolean {
		return this.isFocused;
	}

	set focused(value: boolean) {
		this.isFocused = value;
		this.input.focused = value;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.escape();
			return;
		}

		if (matchesKey(data, "pageUp")) {
			this.scroll = Math.min(this.maxScroll, this.scroll + this.pageSize);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "pageDown")) {
			this.scroll = Math.max(0, this.scroll - this.pageSize);
			this.tui.requestRender();
			return;
		}

		const last = this.options.entries.length - 1;
		if (last >= 0 && matchesKey(data, "up") && this.view > 0) {
			this.view--;
			this.scroll = 0;
			this.tui.requestRender();
			return;
		}
		if (last >= 0 && matchesKey(data, "down") && this.view < last) {
			this.view++;
			this.scroll = 0;
			this.tui.requestRender();
			return;
		}

		this.input.handleInput(data);
	}

	invalidate(): void {
		this.input.invalidate();
		this.markdown.invalidate();
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (event.type !== "wheel" || !event.wheelDelta) return undefined;
		this.scroll = Math.min(this.maxScroll, Math.max(0, this.scroll - event.wheelDelta));
		this.tui.requestRender();
		return { handled: true };
	}

	render(width: number): string[] {
		const theme = this.theme;
		const inner = Math.max(10, width - 4);
		const current = this.view >= 0 ? this.options.entries[this.view] : undefined;

		// Whole answer as markdown, then a window over it sized to the box.
		const answer = current?.a ?? "";
		if (answer !== this.markdownText) {
			this.markdownText = answer;
			this.markdown.setText(answer);
		}
		const lines = answer ? this.markdown.render(inner) : [theme.fg("dim", "…")];
		const question = current ? wrapTextWithAnsi(theme.fg("accent", current.q), inner) : [];

		// Box rows: 2 borders, the answer window, the input, and the question with its blank line.
		const maxHeight = Math.floor(this.tui.terminal.rows * 0.8);
		const rows = Math.max(3, maxHeight - 4 - (current ? question.length + 1 : 0));
		this.pageSize = Math.max(1, rows - 1);
		this.maxScroll = Math.max(0, lines.length - rows);
		this.scroll = Math.min(this.scroll, this.maxScroll);

		const end = lines.length - this.scroll;
		const body: string[] = current
			? [...question, "", ...lines.slice(Math.max(0, end - rows), end)]
			: [];

		const row = (line: string) => {
			const padded = line + " ".repeat(Math.max(0, inner - visibleWidth(line)));
			return theme.fg("border", "│ ") + truncateToWidth(padded, inner, "") + theme.fg("border", " │");
		};

		const title = " btw ";
		const scrolled = this.scroll > 0 ? ` ▲${this.scroll} ` : "";
		const hint = (this.view >= 0 ? " ↑↓ past · enter ask · pgup/pgdn · esc stop/close " : " enter ask · esc close ") + scrolled;
		const top = theme.fg("border", "╭") +
			theme.fg("accent", title) +
			theme.fg("border", `${"─".repeat(Math.max(0, width - 2 - title.length))}╮`);
		const hintWidth = Math.min(visibleWidth(hint), Math.max(0, width - 2));
		const bottom = theme.fg("border", "╰") +
			theme.fg("dim", truncateToWidth(hint, hintWidth, "")) +
			theme.fg("border", `${"─".repeat(Math.max(0, width - 2 - hintWidth))}╯`);

		return [top, ...body.map(row), row(""), row(this.input.render(inner)[0] ?? ""), bottom];
	}

	/** Escape stops the stream first, closes second. */
	private escape(): void {
		if (this.abort) {
			this.abort.abort();
			return;
		}
		this.done();
	}

	private async ask(question: string): Promise<void> {
		this.abort?.abort();

		const entry: BtwEntry = { q: question, a: "", ts: Date.now() };
		this.options.entries.push(entry);
		this.view = this.options.entries.length - 1;
		this.scroll = 0;
		this.input.setValue("");

		const controller = new AbortController();
		this.abort = controller;
		this.tui.requestRender();

		const message: UserMessage = {
			role: "user",
			content: [
				{ type: "text", text: `<conversation>\n${this.options.conversation}\n</conversation>\n\n${question}` },
			],
			timestamp: Date.now(),
		};

		try {
			const stream = this.options.ctx.modelRegistry.streamSimple(
				this.options.model,
				{ systemPrompt: SYSTEM_PROMPT, messages: [message] },
				{ signal: controller.signal, cacheRetention: "none", sessionId: uuidv7() },
			);

			for await (const event of stream) {
				if (event.type === "text_delta") {
					entry.a += event.delta;
					this.tui.requestRender();
				} else if (event.type === "error") {
					entry.a ||= event.error.errorMessage ?? `error (${event.reason})`;
					break;
				}
			}
		} catch (error) {
			entry.a ||= `error: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			if (this.abort === controller) this.abort = undefined;
			if (entry.a) appendHistory(this.options.file, entry);
			this.tui.requestRender();
		}
	}
}
