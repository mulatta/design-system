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
	const parsed: { header: string | null; parts: string[] }[] = [];
	for (const raw of source.split(/\r?\n/)) {
		const line = raw.trimStart();
		if (line.startsWith(">")) {
			parsed.push({ header: line.slice(1), parts: [] });
			continue;
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
			current = { header: null, parts: [] };
			parsed.push(current);
		}
		current.parts.push(residues);
	}
	return parsed.map(({ header, parts }) => {
		const sequence = parts.join("");
		return {
			header,
			sequence,
			length: sequence.length,
			unit: rule === "infer" ? inferUnit(sequence) : rule,
			molecule,
			lines: sequenceLines(sequence, lineLength),
		};
	});
}

export function copyLabel(records: SequenceRecord[]): string {
	return records.length > 1
		? `Copy ${records.length} records`
		: "Copy sequence";
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
