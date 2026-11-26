import { spawn, spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { type Browser, chromium, type Page } from "playwright-core";
import { buildTheme } from "../theme/build.ts";

const testbed = dirname(fileURLToPath(import.meta.url));
const repo = process.cwd();
const verifyRoot = join(repo, "build", "verify");

type RunState = {
	pid: number;
	port: number;
	runDir: string;
	vault: string;
	theme: string;
	snippets: string[];
	hidden: boolean;
	startedAt: string;
};

function fail(message: string): never {
	console.error(`error: ${message}`);
	process.exit(1);
}

function runDirFor(run: string): string {
	return join(verifyRoot, run);
}

function readState(run: string): RunState {
	const file = join(runDirFor(run), "run.json");
	if (!existsSync(file))
		fail(`no run named "${run}" (missing ${file}); launch first`);
	return JSON.parse(readFileSync(file, "utf8")) as RunState;
}

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function freePort(): Promise<number> {
	return new Promise((done, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			server.close(() => done(port));
		});
	});
}

async function cdpVersion(
	port: number,
): Promise<Record<string, string> | null> {
	try {
		const res = await fetch(`http://127.0.0.1:${port}/json/version`);
		return res.ok ? ((await res.json()) as Record<string, string>) : null;
	} catch {
		return null;
	}
}

async function connect(
	state: RunState,
): Promise<{ browser: Browser; page: Page }> {
	const browser = await chromium.connectOverCDP(
		`http://127.0.0.1:${state.port}`,
	);
	for (let i = 0; i < 120; i++) {
		const page = browser
			.contexts()
			.flatMap((c) => c.pages())
			.find((p) => p.url().startsWith("app://"));
		if (page) return { browser, page };
		await new Promise((r) => setTimeout(r, 250));
	}
	await browser.close();
	fail("no Obsidian window appeared");
}

function frontmatterWithClasses(note: string, classes: string[]): string {
	if (classes.length === 0) return note;
	const list = classes.map((c) => `  - ${c}`).join("\n");
	if (note.startsWith("---\n"))
		return note.replace("---\n", `---\ncssclasses:\n${list}\n`);
	return `---\ncssclasses:\n${list}\n---\n\n${note}`;
}

function installStyles(
	vault: string,
	theme: string,
	snippetPaths: string[],
	token: string | null,
): string[] {
	const stamp = token ? `\n/* ${token} */\n` : "";
	if (theme === "wongoji") {
		const built = spawnSync("nix", ["build", ".#fonts", "-o", "build/fonts"], {
			stdio: "inherit",
		});
		if (built.status !== 0) fail("nix build .#fonts failed");
		const dir = join(vault, ".obsidian", "themes", "Wongoji");
		mkdirSync(dir, { recursive: true });
		const fonts = readFileSync(
			join(repo, "build", "fonts", "share", "design-system", "fonts.css"),
			"utf8",
		);
		const css = buildTheme();
		writeFileSync(join(dir, "theme.css"), `${fonts}${css}${stamp}`);
		cpSync(
			join(repo, "obsidian", "theme", "manifest.json"),
			join(dir, "manifest.json"),
		);
	}
	const names: string[] = [];
	if (snippetPaths.length > 0) {
		const dir = join(vault, ".obsidian", "snippets");
		mkdirSync(dir, { recursive: true });
		for (const path of snippetPaths) {
			const name = basename(path);
			writeFileSync(join(dir, name), `${readFileSync(path, "utf8")}${stamp}`);
			names.push(name.replace(/\.css$/, ""));
		}
	}
	return names;
}

function stylesCurrent(state: RunState): boolean {
	const installed = (path: string) =>
		existsSync(path) ? readFileSync(path, "utf8") : "";
	if (
		state.theme === "wongoji" &&
		!installed(
			join(state.vault, ".obsidian", "themes", "Wongoji", "theme.css"),
		).includes(buildTheme())
	)
		return false;
	return state.snippets.every((path) =>
		installed(
			join(state.vault, ".obsidian", "snippets", basename(path)),
		).startsWith(readFileSync(path, "utf8")),
	);
}

async function conceal(page: Page): Promise<void> {
	await page.evaluate(() => {
		const remote = (window as any).require("@electron/remote");
		for (const win of remote.BrowserWindow.getAllWindows()) {
			win.webContents.setBackgroundThrottling(false);
			win.setOpacity(0);
			win.setIgnoreMouseEvents(true);
			win.setFocusable(false);
			win.setAlwaysOnTop(true, "screen-saver");
			win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
			win.showInactive();
		}
	});
}

async function sync(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: { run: { type: "string", default: "main" } },
	});
	const state = readState(values.run);
	if (!alive(state.pid))
		fail(`run "${values.run}" is not live; launch it again`);
	if (state.theme !== "wongoji" && state.snippets.length === 0)
		fail("this run has no theme or snippet to sync");
	const token = `sync-${Date.now()}`;
	installStyles(state.vault, state.theme, state.snippets, token);
	const { browser, page } = await connect(state);
	const expected = (state.theme === "wongoji" ? 1 : 0) + state.snippets.length;
	await page
		.waitForFunction(
			({ token, expected }) =>
				[...document.querySelectorAll("style")].filter((s) =>
					s.textContent?.includes(token),
				).length >= expected,
			{ token, expected },
			{ timeout: 15000, polling: 250 },
		)
		.catch(async () => {
			await browser.close();
			fail("Obsidian did not reload the synced CSS within 15 s");
		});
	if (state.hidden) await conceal(page);
	await browser.close();
	console.log(`SYNCED run=${values.run} ${token}`);
}

async function launch(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: {
			run: { type: "string", default: "main" },
			theme: { type: "string", default: "wongoji" },
			snippet: { type: "string", multiple: true, default: [] },
			cssclass: { type: "string", multiple: true, default: [] },
			notes: { type: "string", default: join(testbed, "notes") },
			scheme: { type: "string", default: "light" },
			foreground: { type: "boolean", default: false },
			visible: { type: "boolean", default: false },
		},
	});
	if (!existsSync(join(repo, "flake.nix")))
		fail("run from the repository root");
	const which = spawnSync("sh", ["-c", "command -v obsidian"], {
		encoding: "utf8",
	});
	if (!which.stdout.startsWith("/nix/store/"))
		fail("obsidian is not the devshell one; run inside `nix develop -c`");

	const runDir = runDirFor(values.run);
	const stateFile = join(runDir, "run.json");
	if (existsSync(stateFile)) {
		const old = JSON.parse(readFileSync(stateFile, "utf8")) as RunState;
		if (alive(old.pid))
			fail(
				`run "${values.run}" is already live (pid ${old.pid}); stop it or pick another --run`,
			);
	}
	const vault = join(runDir, "vault");
	const data = join(runDir, "data");
	rmSync(vault, { recursive: true, force: true });
	rmSync(data, { recursive: true, force: true });
	mkdirSync(join(vault, ".obsidian"), { recursive: true });
	mkdirSync(data, { recursive: true });
	mkdirSync(join(runDir, "shots"), { recursive: true });

	for (const name of readdirSync(values.notes, { recursive: true })
		.map(String)
		.filter((n) => n.endsWith(".md"))) {
		const text = readFileSync(join(values.notes, name), "utf8");
		mkdirSync(dirname(join(vault, name)), { recursive: true });
		writeFileSync(
			join(vault, name),
			frontmatterWithClasses(text, values.cssclass),
		);
	}

	const appearance: Record<string, unknown> = {
		theme: values.scheme === "dark" ? "obsidian" : "moonstone",
		enabledCssSnippets: [] as string[],
	};
	if (values.theme === "wongoji") appearance.cssTheme = "Wongoji";
	else if (values.theme !== "none")
		fail(`unknown --theme ${values.theme} (wongoji|none)`);
	const snippetPaths = values.snippet.map((path) => resolve(path));
	appearance.enabledCssSnippets = installStyles(
		vault,
		values.theme,
		snippetPaths,
		null,
	);
	writeFileSync(
		join(vault, ".obsidian", "appearance.json"),
		JSON.stringify(appearance, null, 2),
	);
	writeFileSync(
		join(data, "obsidian.json"),
		JSON.stringify({
			vaults: { verify: { path: vault, ts: Date.now(), open: true } },
			updateDisabled: true,
		}),
	);

	const port = await freePort();
	const log = openSync(join(runDir, "obsidian.log"), "a");
	writeSync(log, `--- launch ${new Date().toISOString()} ---\n`);
	const child = spawn(
		"obsidian",
		[`--remote-debugging-port=${port}`, `--user-data-dir=${data}`],
		{
			detached: true,
			stdio: values.foreground
				? ["ignore", "pipe", "pipe"]
				: ["ignore", log, log],
		},
	);
	if (child.pid === undefined) fail("obsidian did not start");
	if (values.foreground) {
		for (const stream of [process.stdout, process.stderr])
			stream.on("error", () => {});
		child.stdout?.on("data", (chunk: Buffer) => {
			writeSync(log, chunk);
			process.stdout.write(chunk);
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			writeSync(log, chunk);
			process.stderr.write(chunk);
		});
	} else {
		child.unref();
	}
	const state: RunState = {
		pid: child.pid,
		port,
		runDir,
		vault,
		theme: values.theme,
		snippets: snippetPaths,
		hidden: !values.foreground && !values.visible,
		startedAt: new Date().toISOString(),
	};
	writeFileSync(stateFile, JSON.stringify(state, null, 2));

	try {
		for (let i = 0; i < 160 && !(await cdpVersion(port)); i++)
			await new Promise((r) => setTimeout(r, 250));
		if (!(await cdpVersion(port)))
			throw new Error(`CDP never answered on ${port}`);
		const { browser, page } = await connect(state);
		if (state.hidden) await conceal(page);
		await page.waitForFunction(
			() => (window as any).app?.workspace?.layoutReady === true,
			null,
			{ timeout: 60000 },
		);
		if (state.hidden) await conceal(page);
		await browser.close();
	} catch (error) {
		teardown(values.run, state);
		fail(`launch failed: ${error}; see ${join(runDir, "obsidian.log")}`);
	}
	console.log(
		`READY run=${values.run} pid=${child.pid} port=${port} vault=${vault}`,
	);
	if (!values.foreground) return;
	console.log(
		"Obsidian's log follows. Ctrl+C, closing this terminal, or quitting Obsidian stops the run.",
	);
	const finish = (code: number) => {
		teardown(values.run, state);
		process.exit(code);
	};
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
		process.on(signal, () => finish(0));
	child.on("exit", (code) => finish(code ?? 0));
}

async function doctor(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: { run: { type: "string", default: "main" } },
	});
	const state = readState(values.run);
	const report: Record<string, unknown> = {
		run: values.run,
		pid: state.pid,
		processAlive: alive(state.pid),
	};
	const version = await cdpVersion(state.port);
	report.cdp = version ? version["User-Agent"] : null;
	if (report.processAlive && version) {
		const { browser, page } = await connect(state);
		Object.assign(
			report,
			await page.evaluate(() => {
				const app = (window as any).app;
				return {
					layoutReady: app?.workspace?.layoutReady === true,
					vaultPath: app?.vault?.adapter?.basePath ?? null,
					cssTheme: app?.customCss?.theme ?? null,
					enabledSnippets: [...(app?.customCss?.enabledSnippets ?? [])],
					scheme: document.body.classList.contains("theme-dark")
						? "dark"
						: "light",
					windowOpacity: (window as any)
						.require("@electron/remote")
						.getCurrentWindow()
						.getOpacity() as number,
					notes:
						app?.vault
							?.getMarkdownFiles?.()
							.map((f: { path: string }) => f.path) ?? [],
				};
			}),
		);
		await browser.close();
	}
	report.stylesCurrent = stylesCurrent(state);
	const ok =
		report.processAlive === true &&
		typeof report.cdp === "string" &&
		(report.cdp as string).includes("obsidian") &&
		report.layoutReady === true &&
		report.vaultPath === state.vault &&
		(state.theme !== "wongoji" || report.cssTheme === "Wongoji") &&
		report.stylesCurrent === true;
	console.log(JSON.stringify({ ok, ...report }, null, 2));
	if (!ok) process.exit(1);
}

type Prepare = {
	width: number;
	height: number;
	mobile: boolean;
	note: string | null;
	view: string;
	scheme: string;
	open: string;
	hideRight: boolean;
};

async function prepare(
	page: Page,
	o: Prepare,
): Promise<{ note: string } | { error: string }> {
	const { width, height } = o;
	await page.setViewportSize({ width, height });
	const isMobile = await page.evaluate(
		() => (window as any).app.isMobile === true,
	);
	if (isMobile !== o.mobile) {
		await Promise.all([
			page.waitForEvent("load", { timeout: 60000 }),
			page.evaluate((m) => {
				setTimeout(() => (window as any).app.emulateMobile(m), 0);
			}, o.mobile),
		]);
		await page.waitForFunction(
			() => (window as any).app?.workspace?.layoutReady === true,
			null,
			{
				timeout: 60000,
			},
		);
		await page.setViewportSize({ width, height });
	}
	await page.keyboard.press("Escape");
	return page
		.evaluate(async (o) => {
			const app = (window as any).app;
			const files = (
				app.vault.getMarkdownFiles() as { basename: string; path: string }[]
			).sort((a, b) => a.path.localeCompare(b.path));
			const file = o.note
				? files.find(
						(f) =>
							f.basename === o.note ||
							f.path === o.note ||
							f.path === `${o.note}.md`,
					)
				: files[0];
			if (!file) return { error: `note not found: ${o.note}` };
			const explorer = app.workspace.getLeavesOfType("file-explorer")[0];
			if (explorer && !app.isMobile) await app.workspace.revealLeaf(explorer);
			const leaf = app.workspace.getLeaf(false);
			const mode = o.view === "reading" ? "preview" : "source";
			await leaf.openFile(file, {
				state: { mode, source: o.view === "source" },
			});
			if (file.path.includes("/") && !app.isMobile)
				app.commands.executeCommandById("file-explorer:reveal-active-file");
			app.workspace.setActiveLeaf(leaf, { focus: true });
			const id = o.scheme === "dark" ? "obsidian" : "moonstone";
			if (typeof app.changeTheme === "function") app.changeTheme(id);
			else {
				document.body.classList.toggle("theme-dark", o.scheme === "dark");
				document.body.classList.toggle("theme-light", o.scheme !== "dark");
			}
			const right = document.querySelector(
				".workspace-split.mod-right-split",
			) as HTMLElement | null;
			if (right) right.style.display = o.hideRight ? "none" : "";
			return { note: file.path as string };
		}, o)
		.then(async (result) => {
			if ("note" in result) await openPanel(page, o.open);
			return result;
		});
}

const panels = {
	none: null,
	palette: "command-palette:open",
	settings: "app:open-settings",
	search: "global-search:open",
} as const;

type Panel = keyof typeof panels;

function isPanel(value: string): value is Panel {
	return Object.hasOwn(panels, value);
}

async function openPanel(page: Page, open: string): Promise<void> {
	if (!isPanel(open))
		fail(`unknown --open ${open} (${Object.keys(panels).join("|")})`);
	const id = panels[open];
	if (id)
		await page.evaluate(
			(id) => (window as any).app.commands.executeCommandById(id),
			id,
		);
}

function checkShotOptions(v: {
	view: string;
	scheme: string;
	size: string;
	scroll: string;
	open: string;
}): [number, number] {
	if (!["reading", "live", "source"].includes(v.view))
		fail(`unknown --view ${v.view} (reading|live|source)`);
	if (!["light", "dark"].includes(v.scheme))
		fail(`unknown --scheme ${v.scheme} (light|dark)`);
	if (!isPanel(v.open))
		fail(`unknown --open ${v.open} (${Object.keys(panels).join("|")})`);
	const size = /^(\d+)x(\d+)$/.exec(v.size);
	if (!size) fail(`bad --size ${v.size} (WIDTHxHEIGHT, e.g. 1440x900)`);
	if (!/^\d+$/.test(v.scroll)) fail(`bad --scroll ${v.scroll} (pixels)`);
	return [Number(size[1]), Number(size[2])];
}

async function shot(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: {
			run: { type: "string", default: "main" },
			note: { type: "string" },
			view: { type: "string", default: "reading" },
			scheme: { type: "string", default: "light" },
			size: { type: "string", default: "1440x900" },
			scroll: { type: "string", default: "0" },
			open: { type: "string", default: "none" },
			mobile: { type: "boolean", default: false },
			"hide-right": { type: "boolean", default: false },
			out: { type: "string" },
		},
	});
	const state = readState(values.run);
	if (!alive(state.pid))
		fail(`run "${values.run}" is not live; launch it again`);
	const [width, height] = checkShotOptions(values);
	const { browser, page } = await connect(state);
	const result = await prepare(page, {
		width,
		height,
		mobile: values.mobile,
		note: values.note ?? null,
		view: values.view,
		scheme: values.scheme,
		open: "none",
		hideRight: values["hide-right"],
	});
	if ("error" in result) {
		await browser.close();
		fail(String(result.error));
	}
	await page.evaluate(() => {
		(window as any).__wgScrollSettled = 0;
	});
	await page
		.waitForFunction(
			({ target, selector }) => {
				const scroller = document.querySelector(
					`.workspace-leaf.mod-active ${selector}`,
				) as HTMLElement | null;
				if (!scroller) return false;
				const w = window as any;
				if (Math.abs(scroller.scrollTop - target) >= 2) {
					scroller.scrollTop = target;
					w.__wgScrollSettled = 0;
					return false;
				}
				w.__wgScrollSettled += 1;
				return w.__wgScrollSettled >= 3;
			},
			{
				target: Number(values.scroll),
				selector:
					values.view === "reading"
						? ".markdown-preview-view"
						: ".markdown-source-view .cm-scroller",
			},
			{ timeout: 10000, polling: 250 },
		)
		.catch(() =>
			console.error(
				`warning: could not scroll to ${values.scroll}; the note may be shorter`,
			),
		);
	await page.mouse.move(-10, -10);
	await openPanel(page, values.open);
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(700);
	const name =
		values.out ??
		join(
			state.runDir,
			"shots",
			`${result.note.replace(/\.md$/, "").replace(/[^\p{L}\p{N}]+/gu, "-")}-${values.view}-${values.scheme}${values.mobile ? "-mobile" : ""}${values.open === "none" ? "" : `-${values.open}`}-${values.scroll}.png`,
		);
	const clearSearch = (target: Page) =>
		target.evaluate(() => {
			for (const input of document.querySelectorAll<HTMLInputElement>(
				".vertical-tab-header input[type=search], .modal.mod-settings input[type=search]",
			)) {
				input.value = "";
				input.dispatchEvent(new Event("input", { bubbles: true }));
				input.blur();
			}
		});
	const inPageSettings =
		values.open === "settings" &&
		(await page.evaluate(
			() => !!document.querySelector(".modal.mod-settings"),
		));
	if (values.open === "settings" && !inPageSettings) {
		const pages = () => browser.contexts().flatMap((c) => c.pages());
		const isSettings = (p: Page) => p !== page && !p.url().startsWith("app://");
		let settings = pages().find(isSettings);
		for (let i = 0; i < 80 && !settings; i++) {
			await page.waitForTimeout(125);
			settings = pages().find(isSettings);
		}
		if (!settings) {
			await browser.close();
			fail("settings window did not open");
		}
		if (state.hidden) await conceal(page);
		await settings.waitForLoadState();
		await settings.setViewportSize({ width, height });
		await clearSearch(settings);
		await settings.waitForTimeout(700);
		await clearSearch(settings);
		await settings.screenshot({ path: name });
		await settings.close();
	} else {
		if (inPageSettings) {
			await clearSearch(page);
			await page.waitForTimeout(300);
		}
		await page.screenshot({ path: name });
		await page.keyboard.press("Escape");
	}
	if (state.hidden) await conceal(page);
	await browser.close();
	console.log(`SHOT ${name}`);
}

type Part = {
	id: string;
	note: string;
	root: string;
	last?: boolean;
	pad: [number, number, number, number];
	rightEdge?: number;
	maxHeight?: number;
	measure: Record<string, string>;
};

const reading = ".workspace-leaf.mod-active .markdown-reading-view";

const parts: Part[] = [
	{
		id: "sidebar-tabs",
		note: "lab-note-ko",
		root: ".mod-left-split .workspace-tab-header-container",
		pad: [0, 0, 8, 0],
		measure: {
			tabs: ".workspace-tab-header-container-inner",
			active: ".workspace-tab-header.is-active",
		},
	},
	{
		id: "nav-header",
		note: "lab-note-ko",
		root: ".mod-left-split .nav-header",
		pad: [4, 24, 12, 24],
		measure: { buttons: ".nav-buttons-container" },
	},
	{
		id: "nav-active",
		note: "lab-note-ko",
		root: ".nav-files-container .nav-file-title.is-active",
		pad: [6, 8, 6, 40],
		measure: { label: ".nav-file-title-content" },
	},
	{
		id: "folder-row",
		note: "lab-note-ko",
		root: '.nav-files-container .nav-folder-title[data-path="protocols"]',
		pad: [6, 8, 6, 40],
		measure: {
			icon: ".collapse-icon",
			label: ".nav-folder-title-content",
		},
	},
	{
		id: "split-edge",
		note: "lab-note-ko",
		root: ".workspace-split.mod-left-split",
		pad: [0, 24, 0, 0],
		rightEdge: 72,
		maxHeight: 160,
		measure: {
			handle: ":scope > .workspace-leaf-resize-handle",
			tabs: ":scope > .workspace-tabs",
		},
	},
	{
		id: "ribbon",
		note: "lab-note-ko",
		root: ".workspace-ribbon.mod-primary",
		pad: [0, 8, 0, 0],
		maxHeight: 280,
		measure: {
			first: ".side-dock-ribbon-action",
			icon: ".side-dock-ribbon-action svg",
		},
	},
	{
		id: "view-header",
		note: "lab-note-ko",
		root: ".mod-root .workspace-leaf.mod-active .view-header",
		pad: [0, 0, 0, 0],
		measure: {
			back: ".view-header-nav-buttons .clickable-icon",
			title: ".view-header-title-container",
			actions: ".view-actions",
		},
	},
	{
		id: "vault-bar",
		note: "lab-note-ko",
		root: ".workspace-sidedock-vault-profile",
		pad: [8, 24, 4, 8],
		measure: {
			switcher: ".workspace-drawer-vault-switcher",
			actions: ".workspace-drawer-vault-actions",
		},
	},
	{
		id: "doc-tab",
		note: "lab-note-ko",
		root: ".mod-root .workspace-tab-header.is-active",
		pad: [4, 12, 4, 12],
		measure: { title: ".workspace-tab-header-inner-title" },
	},
	{
		id: "title-rule",
		note: "lab-note-ko",
		root: `${reading} .inline-title`,
		pad: [8, 24, 28, 8],
		measure: {},
	},
	{
		id: "properties",
		note: "elements-ko",
		root: `${reading} .metadata-properties`,
		pad: [8, 8, 8, 8],
		measure: {
			key: ".metadata-property-key",
			icon: ".metadata-property-icon",
			tagPill: ".metadata-property:nth-child(2) .multi-select-pill",
			aliasPill: ".metadata-property:nth-child(3) .multi-select-pill",
		},
	},
	{
		id: "tasks",
		note: "elements-ko",
		root: `${reading} ul.contains-task-list`,
		last: true,
		pad: [6, 8, 6, 40],
		measure: {
			item: "li:nth-child(1)",
			box: "li:nth-child(1) .task-list-item-checkbox",
			doneBox: "li.is-checked .task-list-item-checkbox",
		},
	},
	{
		id: "heading",
		note: "lab-note-ko",
		root: `${reading} h2`,
		pad: [8, 8, 8, 8],
		measure: {},
	},
	{
		id: "code-top",
		note: "lab-note-ko",
		root: `${reading} .el-pre:not(.mod-frontmatter) pre`,
		pad: [12, 12, 0, 12],
		maxHeight: 64,
		measure: {},
	},
	{
		id: "callout",
		note: "lab-note-ko",
		root: `${reading} .callout`,
		pad: [12, 12, 12, 12],
		measure: {},
	},
];

type Box = { x: number; y: number; w: number; h: number };
type Measured = { root: Box; boxes: Record<string, Box | null> };

async function measurePart(page: Page, part: Part): Promise<Measured | null> {
	return page.evaluate(async (p) => {
		const all = document.querySelectorAll(p.root);
		const root = (p.last ? all[all.length - 1] : all[0]) as
			| HTMLElement
			| undefined;
		if (!root) return null;
		root.scrollIntoView({ block: "center" });
		await new Promise((r) => setTimeout(r, 400));
		const box = (r: DOMRect) => ({ x: r.x, y: r.y, w: r.width, h: r.height });
		const rootRect = root.getBoundingClientRect();
		const boxes: Record<
			string,
			{ x: number; y: number; w: number; h: number } | null
		> = {};
		for (const [label, selector] of Object.entries(p.measure)) {
			const el = root.querySelector(selector);
			if (!el) {
				boxes[label] = null;
				continue;
			}
			const r = el.getBoundingClientRect();
			boxes[label] = {
				x: r.x - rootRect.x,
				y: r.y - rootRect.y,
				w: r.width,
				h: r.height,
			};
		}
		return { root: box(rootRect), boxes };
	}, part);
}

function clipFor(part: Part, root: Box, width: number, height: number): Box {
	const [top, right, bottom, left] = part.pad;
	let x = root.x - left;
	let w = root.w + left + right;
	if (part.rightEdge !== undefined) {
		x = root.x + root.w - part.rightEdge;
		w = part.rightEdge + right;
	}
	const y = root.y - top;
	const h = Math.min(
		root.h + top + bottom,
		part.maxHeight ?? Number.POSITIVE_INFINITY,
	);
	const cx = Math.max(0, x);
	const cy = Math.max(0, y);
	return {
		x: cx,
		y: cy,
		w: Math.min(w - (cx - x), width - cx),
		h: Math.min(h - (cy - y), height - cy),
	};
}

async function compare(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: {
			base: { type: "string", default: "stock" },
			run: { type: "string", default: "agent" },
			scheme: { type: "string", default: "light" },
			part: { type: "string", multiple: true, default: [] },
			size: { type: "string", default: "1440x900" },
		},
	});
	const [width, height] = values.size.split("x").map(Number);
	const chosen =
		values.part.length > 0
			? parts.filter((p) => values.part.includes(p.id))
			: parts;
	if (chosen.length === 0)
		fail(`no part matches; parts: ${parts.map((p) => p.id).join(", ")}`);
	const outDir = join(verifyRoot, "compare", values.scheme);
	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });
	const runs = [values.base, values.run];
	const results: Record<string, Record<string, Measured | null>> = {};
	for (const run of runs) {
		const state = readState(run);
		if (!alive(state.pid)) fail(`run "${run}" is not live; launch it again`);
		const { browser, page } = await connect(state);
		const cdp = await page.context().newCDPSession(page);
		results[run] = {};
		for (const part of chosen) {
			const prepared = await prepare(page, {
				width,
				height,
				mobile: false,
				note: part.note,
				view: "reading",
				scheme: values.scheme,
				open: "none",
				hideRight: true,
			});
			if ("error" in prepared) fail(prepared.error);
			await page.waitForTimeout(500);
			const measured = await measurePart(page, part);
			results[run][part.id] = measured;
			if (!measured) continue;
			const clip = clipFor(part, measured.root, width, height);
			if (clip.w <= 0 || clip.h <= 0)
				fail(
					`${run} ${part.id}: root ${JSON.stringify(measured.root)} is outside the ${width}x${height} viewport`,
				);
			const shot = (await cdp.send("Page.captureScreenshot", {
				format: "png",
				clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 2 },
			})) as { data: string };
			writeFileSync(
				join(outDir, `${part.id}.${run}.png`),
				Buffer.from(shot.data, "base64"),
			);
		}
		if (state.hidden) await conceal(page);
		await browser.close();
	}
	writeFileSync(join(outDir, "metrics.json"), JSON.stringify(results, null, 2));
	const round = (n: number) => Math.round(n * 2) / 2;
	const lines: string[] = [];
	const rows: string[] = [];
	for (const part of chosen) {
		const a = results[values.base]?.[part.id];
		const b = results[values.run]?.[part.id];
		const diffs: string[] = [];
		if (!a || !b) diffs.push(`missing in ${!a ? values.base : values.run}`);
		else {
			for (const k of ["w", "h"] as const) {
				const d = round(b.root[k] - a.root[k]);
				if (Math.abs(d) >= 1)
					diffs.push(`root.${k} ${round(a.root[k])} -> ${round(b.root[k])}`);
			}
			for (const label of Object.keys(part.measure)) {
				const ba = a.boxes[label];
				const bb = b.boxes[label];
				if (!ba || !bb) {
					if (ba !== bb)
						diffs.push(`${label} missing in ${!ba ? values.base : values.run}`);
					continue;
				}
				for (const k of ["x", "y", "w", "h"] as const) {
					const d = round(bb[k] - ba[k]);
					if (Math.abs(d) >= 1)
						diffs.push(`${label}.${k} ${round(ba[k])} -> ${round(bb[k])}`);
				}
			}
		}
		lines.push(
			`${part.id}: ${diffs.length === 0 ? "same geometry" : diffs.join(", ")}`,
		);
		rows.push(
			`<tr><th>${part.id}</th><td><img src="${part.id}.${values.base}.png"></td><td><img src="${part.id}.${values.run}.png"></td><td>${diffs.join("<br>") || "same geometry"}</td></tr>`,
		);
	}
	const html = `<!doctype html><meta charset="utf-8"><style>body{font:13px system-ui;margin:16px;background:#fff}td,th{vertical-align:top;padding:8px;border-bottom:1px solid #ddd;text-align:left}img{max-width:560px;outline:1px solid #eee}</style><table><tr><th>part</th><th>${values.base}</th><th>${values.run}</th><th>${values.run} vs ${values.base}, CSS px</th></tr>${rows.join("")}</table>`;
	const index = join(outDir, "index.html");
	writeFileSync(index, html);
	const executablePath = process.env.IMPECCABLE_BROWSER;
	if (executablePath) {
		const viewer = await chromium.launch({ executablePath });
		const page = await viewer.newPage({
			viewport: { width: 1500, height: 800 },
		});
		await page.goto(`file://${index}`);
		await page.screenshot({
			path: join(outDir, "compare.png"),
			fullPage: true,
		});
		await viewer.close();
	}
	console.log(lines.join("\n"));
	console.log(`COMPARE ${outDir}`);
}

type Region = { id: string; selector: string; palette?: boolean };

const regions: Region[] = [
	{ id: "ribbon", selector: ".workspace-ribbon.mod-primary" },
	{
		id: "sidebar-tabs",
		selector: ".mod-left-split .workspace-tab-header-container",
	},
	{ id: "sidebar", selector: ".mod-left-split .nav-files-container" },
	{ id: "vault-bar", selector: ".workspace-sidedock-vault-profile" },
	{ id: "tab-strip", selector: ".mod-root .workspace-tab-header-container" },
	{ id: "active-tab", selector: ".mod-root .workspace-tab-header.is-active" },
	{
		id: "view-header",
		selector: ".mod-root .workspace-leaf.mod-active .view-header",
	},
	{ id: "note", selector: `${reading} .markdown-preview-view` },
	{ id: "status-bar", selector: ".status-bar" },
	{ id: "property-key", selector: `${reading} .metadata-property-key` },
	{ id: "code", selector: `${reading} .el-pre:not(.mod-frontmatter) pre` },
	{ id: "inline-code", selector: `${reading} p code` },
	{ id: "table-head", selector: `${reading} thead th` },
	{ id: "callout", selector: `${reading} .callout` },
	{ id: "palette", selector: ".prompt", palette: true },
];

const boundaries: [string, string][] = [
	["ribbon", "sidebar"],
	["sidebar-tabs", "sidebar"],
	["sidebar", "vault-bar"],
	["sidebar", "note"],
	["tab-strip", "active-tab"],
	["tab-strip", "view-header"],
	["view-header", "note"],
	["note", "status-bar"],
	["note", "property-key"],
	["note", "code"],
	["note", "inline-code"],
	["note", "table-head"],
	["note", "callout"],
	["note", "palette"],
];

type Rgba = [number, number, number, number];
type Side = { width: number; color: Rgba } | null;
type RegionStyle = {
	background: Rgba;
	own: Rgba;
	sides: Record<"top" | "right" | "bottom" | "left", Side>;
	shadow: string;
};

function oklchL([r, g, b]: Rgba): number {
	const lin = (c: number) => {
		const v = c / 255;
		return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	const [R, G, B] = [lin(r), lin(g), lin(b)];
	const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
	const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
	const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
	return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

const hex = ([r, g, b]: Rgba) =>
	`#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

async function readRegion(
	page: Page,
	selector: string,
): Promise<RegionStyle | null> {
	return page.evaluate((sel) => {
		const el = document.querySelector(sel) as HTMLElement | null;
		if (!el) return null;
		const probe = document
			.createElement("canvas")
			.getContext("2d") as CanvasRenderingContext2D;
		const parse = (css: string): [number, number, number, number] => {
			probe.clearRect(0, 0, 1, 1);
			probe.fillStyle = "#000";
			probe.fillStyle = css;
			probe.fillRect(0, 0, 1, 1);
			const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
			return [r, g, b, a / 255];
		};
		const over = (
			top: number[],
			under: number[],
		): [number, number, number, number] => {
			const a = top[3];
			return [0, 1, 2]
				.map((i) => top[i] * a + under[i] * (1 - a))
				.concat(1) as [number, number, number, number];
		};
		const chain: HTMLElement[] = [];
		for (let e: HTMLElement | null = el; e; e = e.parentElement) chain.push(e);
		let bg: number[] = [255, 255, 255, 1];
		for (const e of chain.reverse()) {
			const c = parse(getComputedStyle(e).backgroundColor);
			if (c[3] > 0) bg = over(c, bg);
		}
		const cs = getComputedStyle(el);
		const side = (name: string) => {
			const width = Number.parseFloat(
				cs.getPropertyValue(`border-${name}-width`),
			);
			const style = cs.getPropertyValue(`border-${name}-style`);
			if (!width || style === "none" || style === "hidden") return null;
			const color = parse(cs.getPropertyValue(`border-${name}-color`));
			return color[3] === 0 ? null : { width, color };
		};
		return {
			background: bg as [number, number, number, number],
			own: parse(cs.backgroundColor),
			sides: {
				top: side("top"),
				right: side("right"),
				bottom: side("bottom"),
				left: side("left"),
			},
			shadow: cs.boxShadow,
		};
	}, selector);
}

async function layers(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: {
			run: { type: "string", default: "agent" },
			scheme: { type: "string", default: "light" },
			note: { type: "string", default: "lab-note-ko" },
			threshold: { type: "string", default: "0.025" },
		},
	});
	const state = readState(values.run);
	if (!alive(state.pid))
		fail(`run "${values.run}" is not live; launch it again`);
	const { browser, page } = await connect(state);
	const base = {
		width: 1440,
		height: 900,
		mobile: false,
		note: values.note,
		view: "reading",
		scheme: values.scheme,
		hideRight: true,
	};
	const prepared = await prepare(page, { ...base, open: "none" });
	if ("error" in prepared) fail(prepared.error);
	await page.waitForTimeout(500);
	const found: Record<string, RegionStyle | null> = {};
	for (const r of regions.filter((r) => !r.palette))
		found[r.id] = await readRegion(page, r.selector);
	await prepare(page, { ...base, open: "palette" });
	await page.waitForTimeout(500);
	for (const r of regions.filter((r) => r.palette))
		found[r.id] = await readRegion(page, r.selector);
	await page.keyboard.press("Escape");
	if (state.hidden) await conceal(page);
	await browser.close();

	const threshold = Number(values.threshold);
	const lines: string[] = [
		`regions (${values.run}, ${values.scheme}): background, L, borders`,
	];
	for (const r of regions) {
		const s = found[r.id];
		if (!s) {
			lines.push(`  ${r.id.padEnd(13)} not found`);
			continue;
		}
		const borders = Object.entries(s.sides)
			.filter(([, v]) => v)
			.map(([k, v]) => `${k} ${v?.width}px ${hex(v?.color as Rgba)}`)
			.join(", ");
		const shadow = s.shadow === "none" ? "" : ` shadow ${s.shadow}`;
		lines.push(
			`  ${r.id.padEnd(13)} ${hex(s.background)} L ${oklchL(s.background).toFixed(3)}${borders ? ` | ${borders}` : ""}${shadow}`,
		);
	}
	lines.push(`boundaries: dL (flag below ${threshold})`);
	const pairs = boundaries.map(([a, b]) => {
		const sa = found[a];
		const sb = found[b];
		const dL =
			sa && sb ? Math.abs(oklchL(sa.background) - oklchL(sb.background)) : null;
		return { a, b, dL };
	});
	for (const { a, b, dL } of pairs)
		lines.push(
			`  ${`${a} | ${b}`.padEnd(26)} ${dL === null ? "missing" : `${dL.toFixed(3)}${dL < threshold ? "  < threshold" : ""}`}`,
		);
	const outDir = join(verifyRoot, "layers");
	mkdirSync(outDir, { recursive: true });
	writeFileSync(
		join(outDir, `${values.run}-${values.scheme}.json`),
		JSON.stringify({ regions: found, boundaries: pairs }, null, 2),
	);
	console.log(lines.join("\n"));
}

function stop(args: string[]): void {
	const { values } = parseArgs({
		args,
		options: { run: { type: "string" } },
	});
	if (!values.run) fail("stop needs --run <run>; it never picks a run itself");
	teardown(values.run, readState(values.run));
}

function teardown(run: string, state: RunState): void {
	if (alive(state.pid)) {
		try {
			process.kill(-state.pid, "SIGTERM");
		} catch {
			process.kill(state.pid, "SIGTERM");
		}
	}
	for (let i = 0; i < 40 && alive(state.pid); i++) spawnSync("sleep", ["0.25"]);
	if (alive(state.pid)) {
		try {
			process.kill(-state.pid, "SIGKILL");
		} catch {
			process.kill(state.pid, "SIGKILL");
		}
	}
	rmSync(state.vault, { recursive: true, force: true });
	rmSync(join(state.runDir, "data"), { recursive: true, force: true });
	rmSync(join(state.runDir, "run.json"), { force: true });
	try {
		console.log(
			`STOPPED run=${run}; evidence kept in ${join(state.runDir, "shots")}`,
		);
	} catch {}
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
	case "launch":
		await launch(rest);
		break;
	case "doctor":
		await doctor(rest);
		break;
	case "shot":
		await shot(rest);
		break;
	case "layers":
		await layers(rest);
		break;
	case "compare":
		await compare(rest);
		break;
	case "sync":
		await sync(rest);
		break;
	case "stop":
		stop(rest);
		break;
	default:
		fail(
			"usage: obsidian.ts <launch|doctor|shot|compare|layers|sync|stop> [options]",
		);
}
