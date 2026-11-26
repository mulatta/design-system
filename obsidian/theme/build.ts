import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type DesignSystemState,
	lint,
	type ResolvedColor,
	type ResolvedDimension,
} from "@google/design.md/linter";

const here = dirname(fileURLToPath(import.meta.url));

const partials = [
	"obsidian.css",
	"chrome.css",
	"note.css",
	"code.css",
	"sequence.css",
	"blocks.css",
	"editor.css",
	"ui.css",
	"mobile.css",
];

const schemes = { light: ".theme-light", dark: ".theme-dark" } as const;

function dimension(d: ResolvedDimension): string {
	return `${d.value}${d.unit}`;
}

function colorDeclarations(name: string, c: ResolvedColor): string[] {
	return [
		`--wg-${name}: ${c.hex};`,
		`--wg-${name}-rgb: ${c.r}, ${c.g}, ${c.b};`,
	];
}

function block(selector: string, declarations: string[]): string {
	return `${selector} {\n${declarations.map((d) => `\t${d}`).join("\n")}\n}\n`;
}

export function tokenCss(ds: DesignSystemState): string {
	const shared: string[] = [];
	const byScheme: Record<keyof typeof schemes, string[]> = {
		light: [],
		dark: [],
	};
	for (const [path, color] of ds.colors) {
		const [group, ...rest] = path.split(".");
		if (rest.length === 0) shared.push(...colorDeclarations(path, color));
		else if (group === "light" || group === "dark")
			byScheme[group].push(...colorDeclarations(rest.join("-"), color));
		else
			throw new Error(
				`color group "${group}" is neither light nor dark: ${path}`,
			);
	}
	for (const [name, t] of ds.typography) {
		if (t.fontFamily) shared.push(`--wg-${name}-family: ${t.fontFamily};`);
		if (t.fontSize) shared.push(`--wg-${name}-size: ${dimension(t.fontSize)};`);
		if (t.fontWeight !== undefined)
			shared.push(`--wg-${name}-weight: ${t.fontWeight};`);
		if (t.lineHeight)
			shared.push(`--wg-${name}-line-height: ${dimension(t.lineHeight)};`);
	}
	for (const [name, d] of ds.spacing)
		shared.push(`--wg-${name}: ${dimension(d)};`);
	for (const [name, d] of ds.rounded)
		shared.push(`--wg-radius-${name}: ${dimension(d)};`);
	return [
		block("body", shared),
		block(schemes.light, byScheme.light),
		block(schemes.dark, byScheme.dark),
	].join("\n");
}

export function buildTheme(
	designPath = resolve(here, "..", "..", "DESIGN.md"),
): string {
	const report = lint(readFileSync(designPath, "utf8"));
	const errors = report.findings.filter((f) => f.severity === "error");
	if (errors.length > 0)
		throw new Error(
			`DESIGN.md has errors:\n${errors.map((e) => `${e.path ?? ""} ${e.message}`).join("\n")}`,
		);
	const sources = partials.map((name) =>
		readFileSync(join(here, "src", name), "utf8"),
	);
	return [tokenCss(report.designSystem), ...sources].join("\n");
}

if (import.meta.main) {
	const out = process.argv[2];
	const css = buildTheme();
	if (out) {
		mkdirSync(dirname(resolve(out)), { recursive: true });
		writeFileSync(out, css);
	} else process.stdout.write(css);
}
