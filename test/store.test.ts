import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { appendHistory, loadHistory, projectSlug } from "../extensions/btw/store.ts";

test("one history file per project directory", () => {
	assert.equal(projectSlug("/Users/me/app"), "Users-me-app");
	assert.equal(projectSlug("/Users/me/app/"), "Users-me-app");
	assert.equal(projectSlug("/"), "root");
});

test("history round-trips, skips broken lines, caps the list", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-btw-"));
	try {
		const file = join(dir, "nested", "history.jsonl");
		appendHistory(file, { q: "why", a: "because", ts: 1 });
		appendHistory(file, { q: "how", a: "like this", ts: 2 });
		appendFileSync(file, "not json\n");

		assert.deepEqual(
			loadHistory(file).map((entry) => entry.q),
			["why", "how"],
		);
		assert.deepEqual(
			loadHistory(file, 1).map((entry) => entry.q),
			["how"],
		);
		assert.deepEqual(loadHistory(join(dir, "missing.jsonl")), []);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
