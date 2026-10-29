import type { SessionEntry } from "@earendil-works/pi-coding-agent";

/** Label put on a btw question, so it can be found again and shows up in /tree. */
export const BTW_LABEL = "btw";

export interface BtwEntry {
	q: string;
	a: string;
	ts: number;
}

function messageText(message: { content: unknown }): string {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return message.content
		.flatMap((block: { type?: string; text?: string }) =>
			block?.type === "text" && typeof block.text === "string" ? [block.text] : []
		)
		.join("\n");
}

/** Past btw's of one session: questions labelled btw, each with its answer. */
export function btwHistory(entries: SessionEntry[]): BtwEntry[] {
	const labels = new Map<string, string | undefined>();
	for (const entry of entries) {
		if (entry.type === "label") labels.set(entry.targetId, entry.label);
	}

	const answers = new Map<string, string>();
	for (const entry of entries) {
		if (entry.type === "message" && entry.message.role === "assistant" && entry.parentId) {
			answers.set(entry.parentId, messageText(entry.message));
		}
	}

	return entries.flatMap((entry) => {
		if (entry.type !== "message" || entry.message.role !== "user") return [];
		if (labels.get(entry.id) !== BTW_LABEL) return [];
		return [{
			q: messageText(entry.message),
			a: answers.get(entry.id) ?? "",
			ts: entry.message.timestamp,
		}];
	});
}
