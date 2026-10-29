import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export interface BtwEntry {
	q: string;
	a: string;
	ts: number;
}

/** File name for one project: "/Users/me/app" -> "Users-me-app". */
export function projectSlug(cwd: string): string {
	return cwd.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "root";
}

/** Past btw's for one project, oldest first. Broken lines are skipped. */
export function loadHistory(file: string, limit = 50): BtwEntry[] {
	let text: string;
	try {
		text = readFileSync(file, "utf8");
	} catch {
		return [];
	}
	return text
		.split("\n")
		.flatMap((line) => {
			try {
				return [JSON.parse(line) as BtwEntry];
			} catch {
				return [];
			}
		})
		.slice(-limit);
}

export function appendHistory(file: string, entry: BtwEntry): void {
	mkdirSync(dirname(file), { recursive: true });
	appendFileSync(file, `${JSON.stringify(entry)}\n`);
}
