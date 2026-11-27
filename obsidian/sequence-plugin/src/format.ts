export type SequenceLine = { start: number; groups: string[] };

export type Unit = "nt" | "aa" | "nt/aa";

export type Molecule = "DNA" | "RNA" | "Protein";

type Declaration =
	| { rule: "infer"; molecule: null }
	| { rule: "nt" | "aa"; molecule: Molecule };

export const fences = {
	fasta: { rule: "infer", molecule: null },
	dna: { rule: "nt", molecule: "DNA" },
	rna: { rule: "nt", molecule: "RNA" },
	protein: { rule: "aa", molecule: "Protein" },
} as const satisfies Record<string, Declaration>;

export type Language = keyof typeof fences;

export const languages = Object.keys(fences) as Language[];

export type SequenceRecord = {
	header: string | null;
	source: string;
	lines: SequenceLine[];
	sequence: string;
	length: number;
	unit: Unit;
	molecule: Molecule | null;
};

export type LineLength = 10 | 20 | 30 | 40 | 50 | 60;

export type LineMeasure = {
	available: number;
	group: number;
	gap: number;
	digit: number;
	digits: number;
	positionGap: number;
};

export const GROUP_LENGTH = 10;

const LINE_LENGTHS: readonly LineLength[] = [60, 50, 40, 30, 20, 10];

function chunk(text: string, size: number): string[] {
	const parts: string[] = [];
	for (let i = 0; i < text.length; i += size) {
		parts.push(text.slice(i, i + size));
	}
	return parts;
}

export function sequenceLines(
	sequence: string,
	lineLength: LineLength,
): SequenceLine[] {
	return chunk(sequence, lineLength).map((line, index) => ({
		start: index * lineLength + 1,
		groups: chunk(line, GROUP_LENGTH),
	}));
}

function inferUnit(sequence: string): Unit {
	const letters = sequence.replace(/[-.]/g, "");
	if (/[efijlopqz*]/i.test(letters)) {
		return "aa";
	}
	return /^[acgtun]+$/i.test(letters) ? "nt" : "nt/aa";
}

export function formatSequences(
	source: string,
	lineLength: LineLength,
	language: Language,
): SequenceRecord[] {
	const { rule, molecule }: Declaration = fences[language];
	const parsed: {
		header: string | null;
		parts: string[];
		start: number;
		end: number;
	}[] = [];
	let first: number | null = null;
	let offset = 0;
	for (const raw of source.split(/(?<=\n)/)) {
		const at = offset;
		offset += raw.length;
		const text = raw.replace(/\r?\n$/, "");
		const end = at + text.length;
		const line = text.trimStart();
		if (line.startsWith(">")) {
			parsed.push({ header: line.slice(1), parts: [], start: at, end });
			continue;
		}
		if (line.trimEnd() !== "") {
			first ??= at;
			const current = parsed.at(-1);
			if (current !== undefined) {
				current.end = end;
			}
		}
		if (line.startsWith("ORIGIN") || line.trimEnd() === "//") {
			continue;
		}
		const residues = line.replace(/[\s\d]+/g, "");
		if (residues === "") {
			continue;
		}
		let current = parsed.at(-1);
		if (current === undefined) {
			current = { header: null, parts: [], start: first ?? at, end };
			parsed.push(current);
		}
		current.parts.push(residues);
	}
	return parsed.map(({ header, parts, start, end }) => {
		const sequence = parts.join("");
		return {
			header,
			source: source.slice(start, end),
			sequence,
			length: sequence.length,
			unit: rule === "infer" ? inferUnit(sequence) : rule,
			molecule,
			lines: sequenceLines(sequence, lineLength),
		};
	});
}

export function copiedLabel(records: SequenceRecord[]): string {
	const [only] = records;
	return records.length === 1 && only !== undefined
		? `Copied ${only.length} ${only.unit}`
		: `Copied ${records.length} records`;
}

export function lineLengthFor(measure: LineMeasure): LineLength {
	const position =
		Math.max(3, measure.digits) * measure.digit + measure.positionGap;
	const fits = (lineLength: LineLength) => {
		const groups = lineLength / GROUP_LENGTH;
		return (
			position + groups * measure.group + (groups - 1) * measure.gap <=
			measure.available
		);
	};
	return LINE_LENGTHS.find(fits) ?? 10;
}

const unitNames: Record<Unit, { one: string; many: string; read: string }> = {
	nt: {
		one: "nucleotide",
		many: "nucleotides",
		read: ", read from the letters. Use a dna or rna block to say which.",
	},
	aa: {
		one: "amino acid",
		many: "amino acids",
		read: ", read from the letters. Use a protein block to say so.",
	},
	"nt/aa": {
		one: "residue, a nucleotide or an amino acid",
		many: "residues, nucleotides or amino acids",
		read: ". Use a dna, rna or protein block to say which.",
	},
};

export function badgeLabel({ length, unit, molecule }: SequenceRecord): string {
	const { one, many, read } = unitNames[unit];
	const count = `${length} ${length === 1 ? one : many}`;
	return molecule === null ? `${count}${read}` : `${molecule}, ${count}`;
}

export type PlatformKind = "macos" | "desktop" | "mobile";

const copyActions: Record<PlatformKind, string> = {
	macos: "press ⌘C",
	desktop: "press Ctrl+C",
	mobile: "choose Copy",
};

export function copyFailedLabel(platform: PlatformKind): string {
	return `Could not copy the sequence. Select the block and ${copyActions[platform]}.`;
}

export type Fence<L extends string = string> = { language: L; source: string };

type FenceLine = { indent: number; mark: string; info: string };

function fenceLine(line: string, maxIndent = 3): FenceLine | null {
	const match = /^( *)(`{3,}|~{3,})(.*)$/.exec(line);
	if (match === null) {
		return null;
	}
	const [, indent = "", mark = "", info = ""] = match;
	return indent.length > maxIndent
		? null
		: { indent: indent.length, mark, info };
}

function outdent(lines: string[], indent: number): string {
	const leading = new RegExp(`^ {0,${indent}}`);
	return lines.map((line) => line.replace(leading, "")).join("\n");
}

function closes(line: string, open: FenceLine): boolean {
	const close = fenceLine(line);
	return (
		close !== null &&
		close.mark[0] === open.mark[0] &&
		close.mark.length >= open.mark.length &&
		close.info.trim() === ""
	);
}

export function fenceAt<L extends string>(
	text: string,
	line: number,
	languages: readonly L[],
): Fence<L> | null {
	const lines = text.split(/\r?\n/);
	let start = 0;
	while (start <= line && start < lines.length) {
		const open = fenceLine(lines[start] ?? "");
		if (open === null || (open.mark[0] === "`" && open.info.includes("`"))) {
			start += 1;
			continue;
		}
		let end = start + 1;
		while (end < lines.length && !closes(lines[end] ?? "", open)) {
			end += 1;
		}
		if (line <= end) {
			const word = open.info.trim().split(/\s/)[0];
			const language = languages.find((name) => name === word);
			if (language === undefined) {
				return null;
			}
			return {
				language,
				source: outdent(lines.slice(start + 1, end), open.indent),
			};
		}
		start = end + 1;
	}
	return null;
}

export type Section = { text: string; lineStart: number };

export function blockSource<L extends string>(
	section: Section | null,
	source: string,
	language: L,
): string {
	if (section === null) {
		return source;
	}
	const fence = fenceAt(section.text, section.lineStart, [language]);
	if (fence !== null) {
		return fence.source;
	}
	const first = section.text.split(/\r?\n/)[section.lineStart] ?? "";
	const open = fenceLine(first, Infinity);
	return open === null ? source : outdent(source.split("\n"), open.indent);
}
