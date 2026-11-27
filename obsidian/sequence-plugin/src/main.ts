import { MarkdownRenderChild, Plugin, setIcon } from "obsidian";
import {
	formatSequences,
	GROUP_LENGTH,
	type LineLength,
	type LineMeasure,
	lineLengthFor,
	type SequenceLine,
	type SequenceRecord,
	sequenceLines,
	type UnitRule,
} from "./format.ts";

const languages: [string, UnitRule][] = [
	["fasta", "infer"],
	["dna", "nt"],
	["protein", "aa"],
];

function recordText(root: ParentNode): string {
	const header = root.querySelector(".seq-header");
	const groups = Array.from(root.querySelectorAll(".seq-group"));
	if (header === null && groups.length === 0) {
		return root.textContent ?? "";
	}
	const residues = groups.map((group) => group.textContent ?? "").join("");
	const parts = [header?.textContent ?? "", residues].filter(
		(part) => part !== "",
	);
	return parts.join("\n");
}

function selectionText(range: Range): string {
	const fragment = range.cloneContents();
	for (const element of Array.from(
		fragment.querySelectorAll(".seq-pos, .seq-copy, .seq-badge"),
	)) {
		element.remove();
	}
	const records = Array.from(fragment.querySelectorAll(".seq-record"));
	const roots: ParentNode[] = records.length > 0 ? records : [fragment];
	return roots
		.map(recordText)
		.filter((text) => text !== "")
		.join("\n");
}

function lastStart(lines: SequenceLine[][]): number {
	return Math.max(1, ...lines.map((record) => record.at(-1)?.start ?? 1));
}

class SequenceBlock extends MarkdownRenderChild {
	private readonly records: SequenceRecord[];
	private readonly block: HTMLElement;
	private readonly recordEls: HTMLElement[] = [];
	private readonly widestDigits: number;
	private lineLength: LineLength = 60;
	private digits = 1;
	private frame: number | null = null;
	private readonly source: string;

	constructor(containerEl: HTMLElement, source: string, rule: UnitRule) {
		super(containerEl);
		this.source = source;
		this.records = formatSequences(source, this.lineLength, rule);
		this.widestDigits = String(
			lastStart(
				this.records.map((record) => sequenceLines(record.sequence, 10)),
			),
		).length;
		this.block = containerEl.createDiv({
			cls: rule === "aa" ? ["seq-block", "seq-block--protein"] : "seq-block",
			attr: { "data-records": this.records.length },
		});
		for (const record of this.records) {
			const recordEl = this.block.createDiv({ cls: "seq-record" });
			const head = recordEl.createDiv({ cls: "seq-head" });
			if (record.header !== null) {
				const headerEl = head.createDiv({ cls: "seq-header" });
				headerEl.createSpan({ cls: "seq-header-mark", text: ">" });
				headerEl.appendText(record.header);
			}
			head.createSpan({
				cls: "seq-badge",
				text: `${record.length} ${record.unit}`,
			});
			this.recordEls.push(recordEl);
		}
		this.renderLines(this.records.map((record) => record.lines));
		this.renderCopy(
			this.recordEls[0]?.querySelector<HTMLElement>(".seq-head") ?? this.block,
		);
	}

	override onload(): void {
		const observer = new ResizeObserver(() => this.reflow());
		observer.observe(this.containerEl);
		this.register(() => {
			observer.disconnect();
			if (this.frame !== null) {
				this.block.win.cancelAnimationFrame(this.frame);
			}
		});
	}

	private renderLines(lines: SequenceLine[][]): void {
		this.digits = String(lastStart(lines)).length;
		this.block.setCssProps({ "--seq-pos-width": `${this.digits}ch` });
		for (const [index, recordEl] of this.recordEls.entries()) {
			for (const old of Array.from(recordEl.querySelectorAll(".seq-line"))) {
				old.remove();
			}
			for (const line of lines[index] ?? []) {
				const lineEl = recordEl.createDiv({ cls: "seq-line" });
				lineEl.createSpan({ cls: "seq-pos", text: String(line.start) });
				for (const group of line.groups) {
					lineEl.createSpan({ cls: "seq-group", text: group });
				}
			}
		}
	}

	private reflow(): void {
		const first = this.recordEls[0];
		if (
			first === undefined ||
			this.block.clientWidth === 0 ||
			this.records.every((record) => record.length <= GROUP_LENGTH)
		) {
			return;
		}
		const lineLength = lineLengthFor(this.measure(first));
		if (lineLength === this.lineLength) {
			return;
		}
		this.lineLength = lineLength;
		this.frame ??= this.block.win.requestAnimationFrame(() => {
			this.frame = null;
			this.renderLines(
				this.records.map((record) =>
					sequenceLines(record.sequence, this.lineLength),
				),
			);
		});
	}

	private measure(recordEl: HTMLElement): LineMeasure {
		const probe = recordEl.createDiv({ cls: "seq-line" });
		const pos = probe.createSpan({ cls: "seq-pos", text: "1" });
		const residues = "N".repeat(GROUP_LENGTH);
		const firstEl = probe.createSpan({ cls: "seq-group", text: residues });
		const secondEl = probe.createSpan({ cls: "seq-group", text: residues });
		const line = probe.getBoundingClientRect();
		const first = firstEl.getBoundingClientRect();
		const second = secondEl.getBoundingClientRect();
		const group =
			first.width + parseFloat(getComputedStyle(firstEl).marginRight);
		const digit = parseFloat(getComputedStyle(pos).width) / this.digits;
		probe.remove();
		const style = getComputedStyle(this.block);
		return {
			available:
				this.block.clientWidth -
				parseFloat(style.paddingLeft) -
				parseFloat(style.paddingRight),
			group,
			gap: second.left - first.left - group,
			digit,
			digits: this.widestDigits,
			positionGap: first.left - line.left - this.digits * digit,
		};
	}

	private renderCopy(parent: HTMLElement): void {
		const block = this.block;
		block.addEventListener("copy", (event) => {
			const selection = block.win.getSelection();
			if (selection === null || selection.rangeCount === 0) {
				return;
			}
			const range = selection.getRangeAt(0);
			if (
				!block.contains(range.commonAncestorContainer) ||
				event.clipboardData === null
			) {
				return;
			}
			event.clipboardData.setData("text/plain", selectionText(range));
			event.preventDefault();
		});

		const button = parent.createEl("button", {
			cls: "seq-copy",
			attr: { "aria-label": "Copy sequence", type: "button" },
		});
		setIcon(button, "copy");
		button.addEventListener("click", () => {
			void navigator.clipboard.writeText(this.source).then(() => {
				setIcon(button, "check");
				block.win.setTimeout(() => setIcon(button, "copy"), 1500);
			});
		});
	}
}

export default class SequenceBlocksPlugin extends Plugin {
	override async onload(): Promise<void> {
		for (const [language, rule] of languages) {
			this.registerMarkdownCodeBlockProcessor(language, (source, el, ctx) => {
				ctx.addChild(new SequenceBlock(el, source, rule));
			});
		}
	}
}
