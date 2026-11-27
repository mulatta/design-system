import {
	MarkdownRenderChild,
	Notice,
	Platform,
	Plugin,
	setTooltip,
} from "obsidian";
import {
	badgeLabel,
	blockSource,
	copiedLabel,
	copyFailedLabel,
	type Fence,
	fenceAt,
	formatSequences,
	GROUP_LENGTH,
	type Language,
	type LineLength,
	type LineMeasure,
	languages,
	lineLengthFor,
	lineWidth,
	type PlatformKind,
	positionDigits,
	type SequenceLine,
	type SequenceRecord,
	sequenceLines,
} from "./format.ts";

function platformKind(): PlatformKind {
	if (Platform.isMobile) {
		return "mobile";
	}
	return Platform.isMacOS ? "macos" : "desktop";
}

async function writeSource(source: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(source);
		return true;
	} catch {
		new Notice(copyFailedLabel(platformKind()));
		return false;
	}
}

async function copyFence(fence: Fence<Language>): Promise<boolean> {
	if (!(await writeSource(fence.source))) {
		return false;
	}
	new Notice(copiedLabel(formatSequences(fence.source, 60, fence.language)));
	return true;
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
		fragment.querySelectorAll(".seq-pos, .seq-badge, .seq-status"),
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

class SequenceBlock extends MarkdownRenderChild {
	private readonly records: SequenceRecord[];
	private readonly block: HTMLElement;
	private readonly status: HTMLElement;
	private readonly recordEls: HTMLElement[] = [];
	private readonly fence: Fence<Language>;
	private lineLength: LineLength = 60;
	private frame: number | null = null;
	private copied: { badge: HTMLElement; timer: number } | null = null;

	constructor(containerEl: HTMLElement, fence: Fence<Language>) {
		super(containerEl);
		this.fence = fence;
		this.records = formatSequences(
			fence.source,
			this.lineLength,
			fence.language,
		);
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
			"--seq-pos-width": `${positionDigits(this.records)}ch`,
		});
		for (const record of this.records) {
			const recordEl = this.block.createDiv({ cls: "seq-record" });
			const head = recordEl.createDiv({ cls: "seq-head" });
			if (record.header !== null) {
				const headerEl = head.createDiv({ cls: "seq-header" });
				headerEl.createSpan({ cls: "seq-header-mark", text: ">" });
				headerEl.appendText(record.header);
			}
			this.renderBadge(head, record);
			this.recordEls.push(recordEl);
		}
		this.renderLines(this.records.map((record) => record.lines));
		this.status = this.block.createSpan({
			cls: "seq-status",
			attr: { "aria-live": "polite" },
		});
		this.block.addEventListener("copy", (event) => this.copySelection(event));
	}

	override onload(): void {
		const observer = new ResizeObserver(() => this.reflow());
		observer.observe(this.containerEl);
		const fonts = this.block.doc.fonts;
		const reflow = () => this.reflow();
		fonts.addEventListener("loadingdone", reflow);
		this.register(() => {
			observer.disconnect();
			fonts.removeEventListener("loadingdone", reflow);
			if (this.frame !== null) {
				this.block.win.cancelAnimationFrame(this.frame);
			}
		});
	}

	private renderBadge(head: HTMLElement, record: SequenceRecord): void {
		const badge = head.createSpan({
			cls: "seq-badge",
			attr: { role: "button", tabindex: 0 },
		});
		setTooltip(badge, `Copy · ${badgeLabel(record)}`);
		if (record.molecule !== null) {
			badge.createSpan({ cls: "seq-badge-kind", text: record.molecule });
		}
		badge.createSpan({ cls: "seq-badge-len", text: String(record.length) });
		badge.appendText(" ");
		badge.createSpan({ cls: "seq-badge-unit", text: record.unit });
		const text = this.records.length === 1 ? this.fence.source : record.source;
		const copy = async () => {
			if (!(await writeSource(text))) {
				return;
			}
			const copied = copiedLabel([record]);
			new Notice(copied);
			this.settleCopied();
			this.status.setText(copied);
			badge.addClass("is-copied");
			this.copied = {
				badge,
				timer: this.block.win.setTimeout(() => this.settleCopied(), 1000),
			};
		};
		badge.addEventListener("mousedown", (event) => event.preventDefault());
		badge.addEventListener("click", () => void copy());
		badge.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) {
				void copy();
			}
		});
	}

	private settleCopied(): void {
		if (this.copied === null) {
			return;
		}
		this.block.win.clearTimeout(this.copied.timer);
		this.copied.badge.removeClass("is-copied");
		this.status.setText("");
		this.copied = null;
	}

	private renderLines(lines: SequenceLine[][]): void {
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
		if (first === undefined || this.block.clientWidth === 0) {
			return;
		}
		const measure = this.measure(first);
		const lineLength = lineLengthFor(measure);
		this.block.setCssProps({
			"--seq-grid": `${lineWidth(measure, lineLength)}px`,
		});
		if (
			lineLength === this.lineLength ||
			this.records.every((record) => record.length <= GROUP_LENGTH)
		) {
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
		probe.createSpan({ cls: "seq-pos", text: "1" });
		const residues = "N".repeat(GROUP_LENGTH);
		const firstEl = probe.createSpan({ cls: "seq-group", text: residues });
		const secondEl = probe.createSpan({ cls: "seq-group", text: residues });
		const line = probe.getBoundingClientRect();
		const first = firstEl.getBoundingClientRect();
		const second = secondEl.getBoundingClientRect();
		const group =
			first.width + parseFloat(getComputedStyle(firstEl).marginRight);
		probe.remove();
		const style = getComputedStyle(this.block);
		return {
			available:
				this.block.clientWidth -
				parseFloat(style.paddingLeft) -
				parseFloat(style.paddingRight),
			group,
			gap: second.left - first.left - group,
			position: first.left - line.left,
		};
	}

	private copySelection(event: ClipboardEvent): void {
		const selection = this.block.win.getSelection();
		if (selection === null || selection.rangeCount === 0) {
			return;
		}
		const range = selection.getRangeAt(0);
		if (
			!this.block.contains(range.commonAncestorContainer) ||
			event.clipboardData === null
		) {
			return;
		}
		event.clipboardData.setData("text/plain", selectionText(range));
		event.preventDefault();
	}
}

export default class SequenceBlocksPlugin extends Plugin {
	override async onload(): Promise<void> {
		for (const language of languages) {
			this.registerMarkdownCodeBlockProcessor(language, (source, el, ctx) => {
				const text = blockSource(ctx.getSectionInfo(el), source, language);
				ctx.addChild(new SequenceBlock(el, { language, source: text }));
			});
		}
		this.addCommand({
			id: "copy-sequence-block",
			name: "Copy sequence block at cursor",
			editorCheckCallback: (checking, editor) => {
				const fence = fenceAt(
					editor.getValue(),
					editor.getCursor().line,
					languages,
				);
				if (fence === null) {
					return false;
				}
				if (!checking) {
					void copyFence(fence);
				}
				return true;
			},
		});
	}
}
