import { MarkdownRenderChild, Notice, Plugin, setTooltip } from "obsidian";
import {
	badgeLabel,
	copiedLabel,
	copyLabel,
	formatSequences,
	GROUP_LENGTH,
	type Language,
	type LineLength,
	type LineMeasure,
	languages,
	lineLengthFor,
	type SequenceLine,
	type SequenceRecord,
	sequenceLines,
} from "./format.ts";

const icons = {
	copy: {
		paths: ["M5.5 10.5H0.5V0.5H10.5V5.5", "M5.5 5.5H15.5V15.5H5.5Z"],
		rendering: "crispEdges",
	},
	check: {
		paths: ["M3.5 8.5L6.5 11.5L12.5 4.5"],
		rendering: "geometricPrecision",
	},
};

function drawIcon(button: HTMLElement, icon: keyof typeof icons): void {
	const { paths, rendering } = icons[icon];
	button.empty();
	const svg = button.createSvg("svg", {
		attr: {
			viewBox: "0 0 16 16",
			width: 16,
			height: 16,
			fill: "none",
			stroke: "currentColor",
			"stroke-width": 1,
			"stroke-linecap": "square",
			"shape-rendering": rendering,
			"aria-hidden": "true",
		},
	});
	for (const d of paths) {
		svg.createSvg("path", {
			attr: { d, "vector-effect": "non-scaling-stroke" },
		});
	}
}

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
		fragment.querySelectorAll(".seq-pos, .seq-copy, .seq-badge, .seq-status"),
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

	constructor(containerEl: HTMLElement, source: string, language: Language) {
		super(containerEl);
		this.source = source;
		this.records = formatSequences(source, this.lineLength, language);
		this.widestDigits = String(
			lastStart(
				this.records.map((record) => sequenceLines(record.sequence, 10)),
			),
		).length;
		this.block = containerEl.createDiv({
			cls: "seq-block",
			attr: { "data-records": this.records.length },
		});
		const longest = Math.max(0, ...this.records.map((record) => record.length));
		const widestUnit = Math.max(
			0,
			...this.records.map((record) => record.unit.length),
		);
		this.block.setCssProps({
			"--seq-len-width": `${String(longest).length}ch`,
			"--seq-unit-width": `${widestUnit}ch`,
		});
		for (const record of this.records) {
			const recordEl = this.block.createDiv({ cls: "seq-record" });
			const head = recordEl.createDiv({ cls: "seq-head" });
			if (record.header !== null) {
				const headerEl = head.createDiv({ cls: "seq-header" });
				headerEl.createSpan({ cls: "seq-header-mark", text: ">" });
				headerEl.appendText(record.header);
			}
			const badge = head.createSpan({ cls: "seq-badge" });
			setTooltip(badge, badgeLabel(record));
			if (record.molecule !== null) {
				badge.createSpan({ cls: "seq-badge-kind", text: record.molecule });
			}
			badge.createSpan({ cls: "seq-badge-len", text: String(record.length) });
			badge.appendText(" ");
			badge.createSpan({ cls: "seq-badge-unit", text: record.unit });
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
			attr: { type: "button" },
		});
		const status = block.createSpan({
			cls: "seq-status",
			attr: { "aria-live": "polite" },
		});
		const show = (copied: boolean) => {
			const label = copied
				? copiedLabel(this.records)
				: copyLabel(this.records);
			drawIcon(button, copied ? "check" : "copy");
			button.toggleClass("is-copied", copied);
			setTooltip(button, label);
			status.setText(copied ? label : "");
		};
		show(false);
		let revert: number | undefined;
		const copy = async () => {
			block.win.clearTimeout(revert);
			try {
				await navigator.clipboard.writeText(this.source);
			} catch {
				show(false);
				new Notice("Could not copy the sequence");
				return;
			}
			show(true);
			revert = block.win.setTimeout(() => show(false), 1500);
		};
		button.addEventListener("click", () => void copy());
	}
}

export default class SequenceBlocksPlugin extends Plugin {
	override async onload(): Promise<void> {
		for (const language of languages) {
			this.registerMarkdownCodeBlockProcessor(language, (source, el, ctx) => {
				ctx.addChild(new SequenceBlock(el, source, language));
			});
		}
	}
}
