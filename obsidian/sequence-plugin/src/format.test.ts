import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	badgeLabel,
	blockSource,
	copiedLabel,
	copyFailedLabel,
	fenceAt,
	formatSequences,
	type Language,
	type LineLength,
	languages,
	lineLengthFor,
} from "./format.ts";

const alphabet = "ACGT";

function residues(count: number, offset = 0): string {
	let out = "";
	for (let i = 0; i < count; i++) {
		out += alphabet[(i + offset) % alphabet.length];
	}
	return out;
}

function wrap(sequence: string, width: number): string {
	const rows: string[] = [];
	for (let i = 0; i < sequence.length; i += width) {
		rows.push(sequence.slice(i, i + width));
	}
	return rows.join("\n");
}

describe("formatSequences input shapes", () => {
	it("returns no records for empty or blank input", () => {
		assert.deepEqual(formatSequences("", 60, "fasta"), []);
		assert.deepEqual(formatSequences("\n  \n\t\n", 60, "fasta"), []);
	});

	it("formats a bare sequence with no header", () => {
		const [record, ...rest] = formatSequences("ACGTACGTAC", 60, "fasta");
		assert.equal(rest.length, 0);
		assert.deepEqual(record, {
			header: null,
			source: "ACGTACGTAC",
			sequence: "ACGTACGTAC",
			length: 10,
			unit: "nt",
			molecule: null,
			lines: [{ start: 1, groups: ["ACGTACGTAC"] }],
		});
	});

	it("formats one long sequence line", () => {
		const sequence = residues(150);
		const [record] = formatSequences(`>long\n${sequence}`, 60, "fasta");
		assert.equal(record?.sequence, sequence);
		assert.deepEqual(
			record?.lines.map((line) => line.start),
			[1, 61, 121],
		);
		assert.deepEqual(record?.lines[2]?.groups, [
			sequence.slice(120, 130),
			sequence.slice(130, 140),
			sequence.slice(140, 150),
		]);
	});

	for (const width of [60, 70, 80]) {
		it(`rewraps input with fixed ${width}-character lines`, () => {
			const sequence = residues(205, width);
			const [record] = formatSequences(
				`>wrapped\n${wrap(sequence, width)}\n`,
				60,
				"fasta",
			);
			assert.equal(record?.sequence, sequence);
			assert.deepEqual(
				record?.lines.map((line) => line.start),
				[1, 61, 121, 181],
			);
			assert.equal(
				record?.lines.flatMap((line) => line.groups).join(""),
				sequence,
			);
			assert.deepEqual(
				record?.lines.map((line) => line.groups.join("").length),
				[60, 60, 60, 25],
			);
		});
	}

	it("splits multi-FASTA into records in source order", () => {
		const source = [
			">first sequence",
			"AAAAACCCCC",
			"GGGGG",
			">second",
			"TTTTT",
			">third one",
			"acgt",
		].join("\n");
		const records = formatSequences(source, 60, "fasta");
		assert.deepEqual(
			records.map((record) => [record.header, record.sequence]),
			[
				["first sequence", "AAAAACCCCCGGGGG"],
				["second", "TTTTT"],
				["third one", "acgt"],
			],
		);
		assert.deepEqual(records[0]?.lines, [
			{ start: 1, groups: ["AAAAACCCCC", "GGGGG"] },
		]);
	});

	it("formats protein sequences", () => {
		const protein =
			"MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWERVMGDGERQFSTLKSTVEAIWAGIKATEAAVSEEFGLAPFLPDQIHFVHSQELLSRYPDLDAKGRERAIAKDLGAVFLVGIGGKLSDGHRHDVRAPDYDDWUAQ";
		const [record] = formatSequences(
			`>sp|P69905|TEST Example protein\n${wrap(protein, 60)}`,
			60,
			"fasta",
		);
		assert.equal(record?.header, "sp|P69905|TEST Example protein");
		assert.equal(record?.sequence, protein);
		assert.equal(record?.lines.length, Math.ceil(protein.length / 60));
		assert.equal(
			record?.lines.at(-1)?.start,
			1 + 60 * (record!.lines.length - 1),
		);
	});

	it("ignores blank lines and strips whitespace inside sequence lines", () => {
		const source = "\n>spaced\n\nACGTA CGTAC\n\tGG TT\t\n\n   \nAA  \r\nCC\r\n";
		const [record] = formatSequences(source, 60, "fasta");
		assert.equal(record?.sequence, "ACGTACGTACGGTTAACC");
		assert.deepEqual(record?.lines, [
			{ start: 1, groups: ["ACGTACGTAC", "GGTTAACC"] },
		]);
	});

	it("keeps header text after > verbatim", () => {
		const [record] = formatSequences(
			">  NM_000518.5 Homo sapiens  HBB, mRNA  \nACGT",
			60,
			"fasta",
		);
		assert.equal(record?.header, "  NM_000518.5 Homo sapiens  HBB, mRNA  ");
	});

	it("keeps an empty header and a header with no sequence", () => {
		const records = formatSequences(">\nACGT\n>empty\n>last\nTT", 60, "fasta");
		assert.deepEqual(
			records.map((record) => [
				record.header,
				record.sequence,
				record.lines.length,
			]),
			[
				["", "ACGT", 1],
				["empty", "", 0],
				["last", "TT", 1],
			],
		);
	});

	it("starts a headerless record for residues before the first header", () => {
		const records = formatSequences("ACGT\n>named\nGGCC", 60, "fasta");
		assert.deepEqual(
			records.map((record) => [record.header, record.sequence]),
			[
				[null, "ACGT"],
				["named", "GGCC"],
			],
		);
	});

	it("counts residues per record as length", () => {
		const records = formatSequences(
			">a\nAC GT\nac\n>b\n>c\n" + residues(61),
			60,
			"fasta",
		);
		assert.deepEqual(
			records.map((record) => record.length),
			[6, 0, 61],
		);
	});

	it("preserves lowercase and mixed case residues", () => {
		const [record] = formatSequences("acgtNNNNacgtACGTnnnn", 60, "fasta");
		assert.equal(record?.sequence, "acgtNNNNacgtACGTnnnn");
		assert.deepEqual(record?.lines[0]?.groups, ["acgtNNNNac", "gtACGTnnnn"]);
	});
});

describe("formatSequences units", () => {
	const unitsOf = (source: string, language: Language) =>
		formatSequences(source, 60, language).map((record) => record.unit);

	for (const [letters, unit] of [
		["ACGTACGTAC", "nt"],
		["ACGUACGUAC", "nt"],
		["acgtacgtac", "nt"],
		["acguNNNNac", "nt"],
		["NNNNNNNNNN", "nt"],
		["MKTAYIAKQR", "aa"],
		["ACGTACRTAC", "nt/aa"],
		["ACGTACYTAC", "nt/aa"],
		["ACGTURYSWKMBDHVN-ACGT", "nt/aa"],
		["ACGTXXXXACGT", "nt/aa"],
		["ACGT-ACGT", "nt"],
		["ACGT..ACGT", "nt"],
		["MKT-AYI.AKQR", "aa"],
		["ACGT-RYACGT", "nt/aa"],
	] as const) {
		it(`reads ${letters} in a fasta block as ${unit}`, () => {
			assert.deepEqual(unitsOf(`>r\n${letters}`, "fasta"), [unit]);
		});
	}

	for (const symbol of ["E", "F", "I", "J", "L", "O", "P", "Q", "Z", "*"]) {
		it(`labels a record aa when ${symbol} is its only amino-acid-only symbol`, () => {
			assert.deepEqual(unitsOf(`ACGTAC${symbol}GTAC`, "fasta"), ["aa"]);
		});
	}

	it("reads amino-acid-only symbols in lowercase", () => {
		assert.deepEqual(unitsOf("mktayiakqr\n>e\nacgte", "fasta"), ["aa", "aa"]);
	});

	it("keeps nt/aa for a record with no residues", () => {
		assert.deepEqual(unitsOf(">empty", "fasta"), ["nt/aa"]);
	});

	it("keeps nt/aa for a record of only gaps", () => {
		assert.deepEqual(unitsOf(">gaps\n--..--", "fasta"), ["nt/aa"]);
	});

	it("counts alignment gaps in the length", () => {
		const [record] = formatSequences("ACGT-ACGT", 60, "fasta");
		assert.equal(record?.length, 9);
	});

	it("labels each record of a multi-FASTA block on its own", () => {
		assert.deepEqual(
			unitsOf(
				">prot\nMKTAYIAKQR\n>nuc\nACGTACGTAA\n>amb\nACGTRYACGT\n>empty",
				"fasta",
			),
			["aa", "nt", "nt/aa", "nt/aa"],
		);
	});

	it("takes the unit from a dna, rna, or protein fence whatever the letters", () => {
		const source = ">p\nMKTAYIAKQR\n>n\nACGT\n>r\nACGTRY";
		assert.deepEqual(unitsOf(source, "dna"), ["nt", "nt", "nt"]);
		assert.deepEqual(unitsOf(source, "rna"), ["nt", "nt", "nt"]);
		assert.deepEqual(unitsOf(source, "protein"), ["aa", "aa", "aa"]);
	});
});

describe("formatSequences molecule", () => {
	const moleculesOf = (language: Language) =>
		formatSequences(">a\nACGU\n>b\nMKTAYIAKQR", 60, language).map(
			(record) => record.molecule,
		);

	it("names the molecule a dna, rna, or protein fence declares", () => {
		assert.deepEqual(moleculesOf("dna"), ["DNA", "DNA"]);
		assert.deepEqual(moleculesOf("rna"), ["RNA", "RNA"]);
		assert.deepEqual(moleculesOf("protein"), ["Protein", "Protein"]);
	});

	it("names no molecule in a fasta fence", () => {
		assert.deepEqual(moleculesOf("fasta"), [null, null]);
	});
});

describe("formatSequences GenBank ORIGIN input", () => {
	function origin(sequence: string): string {
		const rows = ["ORIGIN      "];
		for (let i = 0; i < sequence.length; i += 60) {
			const groups = wrap(sequence.slice(i, i + 60), 10).split("\n");
			rows.push(`${String(i + 1).padStart(9)} ${groups.join(" ")}`);
		}
		rows.push("//");
		return rows.join("\n");
	}

	it("drops position numbers and the ORIGIN and // lines", () => {
		const sequence = residues(130).toLowerCase();
		const [record, ...rest] = formatSequences(origin(sequence), 60, "dna");
		assert.equal(rest.length, 0);
		assert.equal(record?.header, null);
		assert.equal(record?.sequence, sequence);
		assert.equal(record?.length, 130);
		assert.equal(record?.unit, "nt");
		assert.deepEqual(
			record?.lines.map((line) => line.start),
			[1, 61, 121],
		);
		assert.deepEqual(record?.lines[2]?.groups, [sequence.slice(120)]);
	});

	it("reads an ORIGIN paste under a FASTA header", () => {
		const sequence = residues(70, 1).toLowerCase();
		const [record] = formatSequences(
			`>syn 12 ORIGIN\n  ${origin(sequence)}`,
			60,
			"dna",
		);
		assert.equal(record?.header, "syn 12 ORIGIN");
		assert.equal(record?.sequence, sequence);
	});
});

describe("formatSequences boundaries", () => {
	it("keeps exactly 10 residues in one group", () => {
		const [record] = formatSequences(residues(10), 60, "fasta");
		assert.deepEqual(record?.lines, [{ start: 1, groups: [residues(10)] }]);
	});

	it("opens a second group at 11 residues", () => {
		const sequence = residues(11);
		const [record] = formatSequences(sequence, 60, "fasta");
		assert.deepEqual(record?.lines, [
			{ start: 1, groups: [sequence.slice(0, 10), sequence.slice(10)] },
		]);
	});

	it("keeps exactly 60 residues on one line of six groups", () => {
		const sequence = residues(60);
		const [record] = formatSequences(sequence, 60, "fasta");
		assert.equal(record?.lines.length, 1);
		assert.deepEqual(record?.lines[0]?.groups, [
			sequence.slice(0, 10),
			sequence.slice(10, 20),
			sequence.slice(20, 30),
			sequence.slice(30, 40),
			sequence.slice(40, 50),
			sequence.slice(50, 60),
		]);
	});

	it("opens a second line at 61 residues starting at position 61", () => {
		const sequence = residues(61);
		const [record] = formatSequences(sequence, 60, "fasta");
		assert.equal(record?.lines.length, 2);
		assert.equal(record?.lines[0]?.groups.length, 6);
		assert.deepEqual(record?.lines[1], {
			start: 61,
			groups: [sequence.slice(60)],
		});
	});

	it("numbers line starts 1, 61, 121 and onward", () => {
		const [record] = formatSequences(residues(600), 60, "fasta");
		assert.deepEqual(
			record?.lines.map((line) => line.start),
			[1, 61, 121, 181, 241, 301, 361, 421, 481, 541],
		);
		assert.ok(
			record?.lines.every((line) =>
				line.groups.every((group) => group.length === 10),
			),
		);
	});
});

describe("formatSequences line length", () => {
	const lengths: LineLength[] = [10, 20, 30, 40, 50, 60];
	for (const lineLength of lengths) {
		it(`lays out ${lineLength} residues per line in groups of 10`, () => {
			const sequence = residues(205);
			const [record] = formatSequences(
				`>reflow\n${wrap(sequence, 70)}`,
				lineLength,
				"fasta",
			);
			const lineCount = Math.ceil(205 / lineLength);
			assert.deepEqual(
				record?.lines.map((line) => line.start),
				Array.from({ length: lineCount }, (_, i) => 1 + i * lineLength),
			);
			assert.deepEqual(
				record?.lines.map((line) => line.groups.join("")),
				Array.from({ length: lineCount }, (_, i) =>
					sequence.slice(i * lineLength, (i + 1) * lineLength),
				),
			);
			assert.ok(
				record?.lines.every((line) =>
					line.groups.every((group) => group.length <= 10),
				),
			);
			assert.equal(record?.length, 205);
		});
	}

	it("opens a new line at residue 31 with 30 per line", () => {
		const sequence = residues(61);
		const [record] = formatSequences(sequence, 30, "fasta");
		assert.deepEqual(record?.lines, [
			{
				start: 1,
				groups: [
					sequence.slice(0, 10),
					sequence.slice(10, 20),
					sequence.slice(20, 30),
				],
			},
			{
				start: 31,
				groups: [
					sequence.slice(30, 40),
					sequence.slice(40, 50),
					sequence.slice(50, 60),
				],
			},
			{ start: 61, groups: [sequence.slice(60)] },
		]);
	});
});

describe("record source", () => {
	const sources = (source: string, language: Language = "fasta") =>
		formatSequences(source, 60, language).map((record) => record.source);

	it("slices each record of a multi-FASTA block from its header line", () => {
		const source = [
			">a first",
			"ACGTACGTAC",
			"GGCC",
			">b",
			"TTTT",
			">c last",
			"acgt",
		].join("\n");
		assert.deepEqual(sources(source), [
			">a first\nACGTACGTAC\nGGCC",
			">b\nTTTT",
			">c last\nacgt",
		]);
	});

	it("keeps the lines as written, spaces, digits, and indentation included", () => {
		const source = ">a\n  ACGTA CGTAC 10\n\tGG\n>b\nTT";
		assert.deepEqual(sources(source), [">a\n  ACGTA CGTAC 10\n\tGG", ">b\nTT"]);
	});

	it("starts a headerless record at its first line", () => {
		assert.deepEqual(sources("\n\nACGT\nGG\n>named\nCC"), [
			"ACGT\nGG",
			">named\nCC",
		]);
	});

	it("keeps a GenBank ORIGIN paste whole, its ORIGIN and // lines included", () => {
		const source = [
			"ORIGIN",
			"        1 atggcagctc tcccccttac",
			"       21 tatggcaggg",
			"//",
			"",
		].join("\n");
		assert.deepEqual(sources(source, "dna"), [source.trimEnd()]);
	});

	it("drops blank lines after a record but keeps blank lines inside it", () => {
		const source = ">a\nACGT\n\nGG\n\n  \n>b\nTT\n\n";
		assert.deepEqual(sources(source), [">a\nACGT\n\nGG", ">b\nTT"]);
	});

	it("keeps CRLF line ends inside a record and drops the one after it", () => {
		const source = ">a\r\nACGT\r\nGG\r\n>b\r\nTT\r\n";
		assert.deepEqual(sources(source), [">a\r\nACGT\r\nGG", ">b\r\nTT"]);
	});

	it("gives a header with no residues its header line", () => {
		assert.deepEqual(sources(">empty\n>full\nAC"), [">empty", ">full\nAC"]);
	});
});

describe("lineLengthFor", () => {
	const measure = {
		group: 100,
		gap: 10,
		digit: 8,
		digits: 3,
		positionGap: 10,
	};
	const need = (groups: number, digits = 3) =>
		Math.max(3, digits) * 8 + 10 + groups * 100 + (groups - 1) * 10;

	it("picks 60 when six groups fit exactly", () => {
		assert.equal(lineLengthFor({ ...measure, available: need(6) }), 60);
	});

	it("drops to 50 one pixel short of six groups", () => {
		assert.equal(lineLengthFor({ ...measure, available: need(6) - 1 }), 50);
	});

	it("picks the largest count of groups that fits", () => {
		for (const groups of [1, 2, 3, 4, 5] as const) {
			assert.equal(
				lineLengthFor({ ...measure, available: need(groups) }),
				groups * 10,
			);
			assert.equal(
				lineLengthFor({ ...measure, available: need(groups + 1) - 1 }),
				groups * 10,
			);
		}
	});

	it("never goes above 60", () => {
		assert.equal(lineLengthFor({ ...measure, available: 10_000 }), 60);
	});

	it("keeps 10 when not even one group fits", () => {
		assert.equal(lineLengthFor({ ...measure, available: 50 }), 10);
		assert.equal(lineLengthFor({ ...measure, available: 0 }), 10);
	});

	it("sizes the position column at no less than three digits", () => {
		for (const digits of [1, 2, 3]) {
			assert.equal(
				lineLengthFor({ ...measure, digits, available: need(6) }),
				60,
			);
			assert.equal(
				lineLengthFor({ ...measure, digits, available: need(6) - 1 }),
				50,
			);
		}
	});

	it("widens the position column for four or more digits", () => {
		assert.equal(
			lineLengthFor({ ...measure, digits: 4, available: need(6) }),
			50,
		);
		assert.equal(
			lineLengthFor({ ...measure, digits: 4, available: need(6, 4) }),
			60,
		);
	});
});

describe("copiedLabel", () => {
	it("names the length and unit of a single record", () => {
		assert.equal(
			copiedLabel(formatSequences(`>one\n${residues(174)}`, 60, "dna")),
			"Copied 174 nt",
		);
		assert.equal(
			copiedLabel(formatSequences("MKTAYIAKQR", 60, "fasta")),
			"Copied 10 aa",
		);
	});

	it("counts the records of a multi-FASTA block", () => {
		const source = [
			">a",
			residues(42),
			">b",
			residues(60),
			">c",
			residues(132),
		];
		assert.equal(
			copiedLabel(formatSequences(source.join("\n"), 60, "fasta")),
			"Copied 3 records",
		);
	});
});

describe("badgeLabel", () => {
	const label = (source: string, language: Language) =>
		formatSequences(source, 60, language).map(badgeLabel);

	it("names the declared molecule and spells out its unit", () => {
		assert.deepEqual(label(residues(96), "dna"), ["DNA, 96 nucleotides"]);
		assert.deepEqual(label("ACGU".repeat(15), "rna"), ["RNA, 60 nucleotides"]);
		assert.deepEqual(label("M".repeat(214), "protein"), [
			"Protein, 214 amino acids",
		]);
	});

	it("says a fasta record's nucleotides were read from the letters", () => {
		assert.deepEqual(label(residues(174), "fasta"), [
			"174 nucleotides, read from the letters. Use a dna or rna block to say which.",
		]);
	});

	it("says a fasta record's amino acids were read from the letters", () => {
		assert.deepEqual(label("MKTAYIAKQR".repeat(9) + "MKTAYI", "fasta"), [
			"96 amino acids, read from the letters. Use a protein block to say so.",
		]);
	});

	it("names both units and every block that settles them for an ambiguous fasta record", () => {
		assert.deepEqual(label("ACGTRYACGTRYACGTRYACGTRY", "fasta"), [
			"24 residues, nucleotides or amino acids. Use a dna, rna or protein block to say which.",
		]);
	});

	it("uses the singular for a length of 1", () => {
		assert.deepEqual(label("A", "dna"), ["DNA, 1 nucleotide"]);
		assert.deepEqual(label("U", "rna"), ["RNA, 1 nucleotide"]);
		assert.deepEqual(label("M", "protein"), ["Protein, 1 amino acid"]);
		assert.deepEqual(label("A", "fasta"), [
			"1 nucleotide, read from the letters. Use a dna or rna block to say which.",
		]);
		assert.deepEqual(label("E", "fasta"), [
			"1 amino acid, read from the letters. Use a protein block to say so.",
		]);
		assert.deepEqual(label("R", "fasta"), [
			"1 residue, a nucleotide or an amino acid. Use a dna, rna or protein block to say which.",
		]);
	});
});

describe("copyFailedLabel", () => {
	it("names the macOS shortcut", () => {
		assert.equal(
			copyFailedLabel("macos"),
			"Could not copy the sequence. Select the block and press ⌘C.",
		);
	});

	it("names the Ctrl shortcut on other desktops", () => {
		assert.equal(
			copyFailedLabel("desktop"),
			"Could not copy the sequence. Select the block and press Ctrl+C.",
		);
	});

	it("names the Copy action on mobile, which has no key to press", () => {
		assert.equal(
			copyFailedLabel("mobile"),
			"Could not copy the sequence. Select the block and choose Copy.",
		);
	});
});

describe("fenceAt", () => {
	const at = (lines: string[], line: number) =>
		fenceAt(lines.join("\n"), line, languages);
	const note = [
		"# Note",
		"",
		"```fasta",
		">first",
		"ACGTACGTAC",
		"GGCC",
		">second",
		"TTTT",
		"```",
		"prose",
	];
	const multi = {
		language: "fasta",
		source: ">first\nACGTACGTAC\nGGCC\n>second\nTTTT",
	};

	it("returns the lines between the fences of a multi-record fasta block", () => {
		assert.deepEqual(at(note, 4), multi);
		assert.equal(formatSequences(multi.source, 60, "fasta").length, 2);
	});

	it("counts the opening and closing fence lines as inside", () => {
		assert.deepEqual(at(note, 2), multi);
		assert.deepEqual(at(note, 8), multi);
	});

	it("returns null outside every fence", () => {
		for (const line of [0, 1, 9]) assert.equal(at(note, line), null);
	});

	it("reads an rna fence", () => {
		assert.deepEqual(at(["```rna", ">guide", "ACGU", "```"], 2), {
			language: "rna",
			source: ">guide\nACGU",
		});
	});

	it("reads a tilde fence", () => {
		assert.deepEqual(at(["~~~dna", "ACGT", "~~~"], 1), {
			language: "dna",
			source: "ACGT",
		});
	});

	it("keeps a shorter fence line inside a longer fence", () => {
		const lines = ["````protein", "MKT", "```", "AYI", "````", "after"];
		assert.deepEqual(at(lines, 3), {
			language: "protein",
			source: "MKT\n```\nAYI",
		});
		assert.equal(at(lines, 5), null);
	});

	it("does not close a backtick fence with tildes or with an info string", () => {
		const lines = ["```dna", "ACGT", "~~~", "```dna", "GG", "```"];
		assert.deepEqual(at(lines, 4), {
			language: "dna",
			source: "ACGT\n~~~\n```dna\nGG",
		});
	});

	it("runs an unclosed fence to the end of the document", () => {
		assert.deepEqual(at(["prose", "```dna", "ACGT", "GGCC", ""], 3), {
			language: "dna",
			source: "ACGT\nGGCC\n",
		});
	});

	it("takes the first word of the info string as the language", () => {
		assert.deepEqual(at(["```fasta title=x", "ACGT", "```"], 1), {
			language: "fasta",
			source: "ACGT",
		});
	});

	it("matches the language case-sensitively, as Obsidian does", () => {
		assert.equal(at(["```FASTA", "ACGT", "```"], 1), null);
	});

	it("returns null inside a fence of another language", () => {
		assert.equal(at(["```python", "ACGT", "```"], 1), null);
	});

	it("does not open a sequence fence inside a fence of another language", () => {
		const lines = ["````markdown", "```fasta", "ACGT", "```", "````"];
		assert.equal(at(lines, 2), null);
	});

	it("strips up to the opening fence's indentation from each line", () => {
		const lines = ["   ```dna", "     ACGT", "  GG", "CC", "   ```"];
		assert.deepEqual(at(lines, 2), {
			language: "dna",
			source: "  ACGT\nGG\nCC",
		});
	});

	it("does not take a line indented four spaces as a fence", () => {
		assert.equal(at(["    ```dna", "ACGT", "    ```"], 1), null);
	});

	it("returns null for a fence in a blockquote or callout, which it does not read", () => {
		assert.equal(at(["> ```fasta", "> ACGT", "> ```"], 1), null);
		assert.equal(at(["> [!note]", "> ```dna", "> ACGT", "> ```"], 2), null);
	});
});

describe("blockSource", () => {
	const doc = (lines: string[]) => lines.join("\n");
	const command = (text: string, line: number) =>
		fenceAt(text, line, languages)?.source;

	it("copies what the command copies from a fence indented three spaces", () => {
		const text = doc(["prose", "", "   ```dna", "     ACGT", "  GG", "   ```"]);
		const section = { text, lineStart: 2 };
		const live = blockSource(section, "     ACGT\n  GG", "dna");
		const reading = blockSource(section, "  ACGT\nGG", "dna");
		assert.equal(live, "  ACGT\nGG");
		assert.equal(reading, live);
		assert.equal(command(text, 3), live);
	});

	it("copies what the command copies from a fence in a bullet list", () => {
		const text = doc(["- item", "  ```dna", "  TTTT", "  ```", "- next"]);
		const live = blockSource({ text, lineStart: 1 }, "  TTTT", "dna");
		const reading = blockSource({ text, lineStart: 0 }, "TTTT", "dna");
		assert.equal(live, "TTTT");
		assert.equal(reading, live);
		assert.equal(command(text, 2), live);
	});

	it("drops the list indentation of a fence four spaces into a numbered item", () => {
		const text = doc(["1. item", "    ```rna", "    ACGU", "    ```"]);
		const live = blockSource({ text, lineStart: 1 }, "    ACGU", "rna");
		const reading = blockSource({ text, lineStart: 0 }, "ACGU", "rna");
		assert.equal(live, "ACGU");
		assert.equal(reading, live);
	});

	it("keeps the processor's text for a fence in a blockquote", () => {
		const text = doc(["> ```dna", "> CCCC", "> ```"]);
		assert.equal(blockSource({ text, lineStart: 0 }, "CCCC", "dna"), "CCCC");
	});

	it("keeps the processor's text without a section", () => {
		assert.equal(blockSource(null, "  ACGT", "dna"), "  ACGT");
	});
});
