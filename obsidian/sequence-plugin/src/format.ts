export type SequenceLine = { start: number; groups: string[] };

export type Unit = "nt" | "aa" | "nt/aa";

export type UnitRule = "nt" | "aa" | "infer";

export type SequenceRecord = {
	header: string | null;
	lines: SequenceLine[];
	sequence: string;
	length: number;
	unit: Unit;
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

function unitOf(sequence: string, rule: UnitRule): Unit {
	if (rule !== "infer") {
		return rule;
	}
	return /[efijlopqz*]/i.test(sequence) ? "aa" : "nt/aa";
}

export function formatSequences(
	source: string,
	lineLength: LineLength,
	rule: UnitRule,
): SequenceRecord[] {
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
			unit: unitOf(sequence, rule),
			lines: sequenceLines(sequence, lineLength),
		};
	});
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
