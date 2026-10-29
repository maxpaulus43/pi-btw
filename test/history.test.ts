import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { btwHistory } from "../extensions/btw/history.ts";

let counter = 0;
function entry(partial: Record<string, unknown>): SessionEntry {
	counter++;
	return { id: `e${counter}`, parentId: null, timestamp: "", ...partial } as unknown as SessionEntry;
}
function user(id: string, text: string, parentId: string | null = null) {
	return entry({ type: "message", id, parentId, message: { role: "user", content: text, timestamp: 1 } });
}
function assistant(id: string, text: string, parentId: string) {
	return entry({ type: "message", id, parentId, message: { role: "assistant", content: [{ type: "text", text }], timestamp: 2 } });
}
function label(targetId: string, value: string | undefined) {
	return entry({ type: "label", targetId, label: value });
}

test("keeps labelled btw questions with their answers", () => {
	const entries = [
		user("q1", "why did the build fail?"),
		assistant("a1", "a missing import", "q1"),
		label("q1", "btw"),
		user("q2", "plain main thread question"),
		assistant("a2", "plain answer", "q2"),
	];

	assert.deepEqual(btwHistory(entries), [{ q: "why did the build fail?", a: "a missing import", ts: 1 }]);
});

test("drops the label when it is cleared, and tolerates a missing answer", () => {
	const entries = [
		user("q1", "unanswered btw"),
		label("q1", "btw"),
		user("q2", "relabelled"),
		label("q2", "btw"),
		label("q2", undefined),
	];

	assert.deepEqual(btwHistory(entries), [{ q: "unanswered btw", a: "", ts: 1 }]);
});

test("answers made of several text blocks are joined", () => {
	const entries = [
		user("q1", "two blocks?"),
		entry({
			type: "message",
			id: "a1",
			parentId: "q1",
			message: { role: "assistant", content: [{ type: "text", text: "one" }, { type: "text", text: "two" }], timestamp: 3 },
		}),
		label("q1", "btw"),
	];

	assert.equal(btwHistory(entries)[0]?.a, "one\ntwo");
});
