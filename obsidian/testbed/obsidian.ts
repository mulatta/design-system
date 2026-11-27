import { spawn, spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { type Browser, chromium, errors, type Page } from "playwright-core";
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
			if (file.path.includes("/") && !app.isMobile && explorer) {
				app.commands.executeCommandById("file-explorer:reveal-active-file");
				for (let i = 0; i < 40 && app.workspace.activeLeaf !== explorer; i++)
					await new Promise((r) => setTimeout(r, 25));
			}
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
			tagPill:
				'.metadata-property[data-property-key="tags"] .multi-select-pill',
			aliasPill:
				'.metadata-property[data-property-key="aliases"] .multi-select-pill',
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
		pad: [8, 8, 8, 32],
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

type Outcome = {
	pass: boolean;
	reason: string;
	facts: Record<string, unknown>;
};

type EditCheck = {
	id: string;
	view: "reading" | "live";
	open?: Panel;
	shot: string;
	run: (page: Page) => Promise<Outcome>;
};

const drawsOutline = (o: { style: string; width: number }) =>
	o.style !== "none" && o.width > 0;

const clickCentre = async (page: Page, selector: string) => {
	const box = await page.evaluate((s) => {
		const el = document.querySelector(s) as HTMLElement | null;
		if (!el) return null;
		el.scrollIntoView({ block: "center" });
		const r = el.getBoundingClientRect();
		return { x: r.x + Math.min(40, r.width / 2), y: r.y + r.height / 2 };
	}, selector);
	if (box) await page.mouse.click(box.x, box.y);
	return box !== null;
};

const installRing = (page: Page) =>
	page.evaluate(() => {
		const w = window as any;
		w.__ring = (el: Element) => {
			const cs = getComputedStyle(el);
			const outline =
				cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth) > 0
					? `outline ${cs.outlineWidth} ${cs.outlineColor}`
					: "";
			const shadow = /(^|[\s(,])(0?\.\d*[1-9]|[1-9][\d.]*)px/.test(cs.boxShadow)
				? `box-shadow ${cs.boxShadow}`
				: "";
			return [outline, shadow].filter(Boolean).join(", ");
		};
	});

const selectRows = async (page: Page): Promise<Outcome> => {
	await installRing(page);
	const rows = await page.evaluate(() => {
		const rows = [
			...document.querySelectorAll(
				".workspace-leaf.mod-active .metadata-property",
			),
		].filter((el) => el.checkVisibility());
		for (const [i, el] of rows.entries())
			el.setAttribute("data-ring-target", String(i));
		return rows.length;
	});
	const problems: string[] = [];
	const facts: Record<string, unknown>[] = [];
	for (let i = 0; i < rows; i++) {
		await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
		await page.mouse.move(-10, -10);
		await page.waitForTimeout(150);
		const row = page.locator(`[data-ring-target="${i}"]`);
		const rest = await row.evaluate((el) => {
			const w = window as any;
			const value = el.querySelector(".metadata-property-value");
			if (!value) return null;
			el.scrollIntoView({ block: "center" });
			const r = value.getBoundingClientRect();
			const y = r.y + r.height / 2;
			for (let x = r.right - 6; x > r.x; x -= 12) {
				const hit = document.elementFromPoint(x, y);
				if (hit === value || hit === el) {
					const label = el.querySelector(".metadata-property-key");
					if (!label) return null;
					const k = label.getBoundingClientRect();
					return {
						key: el.getAttribute("data-property-key"),
						x,
						y,
						labelX: k.x + k.width * 0.6,
						labelY: k.y + k.height / 2,
						ring: w.__ring(el),
						background: getComputedStyle(el).backgroundColor,
						labelBackground: getComputedStyle(label).backgroundColor,
					};
				}
			}
			return null;
		});
		if (!rest) continue;
		const state = () =>
			row.evaluate((el) => ({
				ring: (window as any).__ring(el) as string,
				background: getComputedStyle(el).backgroundColor,
				labelBackground: getComputedStyle(
					el.querySelector(".metadata-property-key") ?? el,
				).backgroundColor,
				selected: document.activeElement === el,
			}));
		const unchanged = (s: Awaited<ReturnType<typeof state>>) =>
			s.ring === rest.ring &&
			s.background === rest.background &&
			s.labelBackground === rest.labelBackground;
		const hovers: Record<string, Awaited<ReturnType<typeof state>>> = {};
		for (const [part, x, y] of [
			["name", rest.labelX, rest.labelY],
			["value", rest.x, rest.y],
		] as const) {
			await page.mouse.move(x, y);
			await page.waitForTimeout(250);
			hovers[part] = await state();
			if (!unchanged(hovers[part]))
				problems.push(
					`hovering ${rest.key}'s ${part} changes the row: ${JSON.stringify(hovers[part])}`,
				);
		}
		await page.mouse.down();
		await page.waitForTimeout(150);
		const pressed = await state();
		await page.mouse.up();
		await page.mouse.move(-10, -10);
		await page.waitForTimeout(250);
		const chosen = await state();
		facts.push({ ...rest, hovers, pressed, chosen });
		if (pressed.background !== rest.background)
			problems.push(
				`pressing beside ${rest.key}'s value tints the row before release: ${pressed.background}`,
			);
		if (!chosen.selected)
			problems.push(
				`clicking beside ${rest.key}'s value did not select the row`,
			);
		else if (chosen.ring !== rest.ring)
			problems.push(`selecting ${rest.key} rings it: ${chosen.ring}`);
		else if (chosen.background === rest.background)
			problems.push(
				`selecting ${rest.key} leaves its background ${rest.background}`,
			);
	}
	await page.evaluate(() => {
		for (const el of document.querySelectorAll("[data-ring-target]"))
			el.removeAttribute("data-ring-target");
	});
	if (facts.length === 0)
		return {
			pass: false,
			reason: "no property row with an empty value area",
			facts: {},
		};
	return {
		pass: problems.length === 0,
		reason:
			problems.length === 0
				? `hovering, pressing, and selecting ${facts.map((f) => f.key).join(", ")} draw no ring; only a released selection tints the row`
				: problems.join(" | "),
		facts: { rows: facts },
	};
};

const ringsOnClick = async (page: Page, selector: string): Promise<Outcome> => {
	const clicked: Record<string, unknown>[] = [];
	let left = 0;
	page.setDefaultTimeout(2000);
	const count = await page.evaluate((selector) => {
		const targets = [...document.querySelectorAll(selector)].filter(
			(el) => el.checkVisibility() && !el.parentElement?.matches(":read-write"),
		);
		for (const [i, el] of targets.entries())
			el.setAttribute("data-ring-target", String(i));
		return targets.length;
	}, selector);
	for (let i = 0; i < count; i++) {
		const target = page.locator(`[data-ring-target="${i}"]`);
		if ((await target.count()) === 0) {
			left++;
			continue;
		}
		try {
			await page.evaluate(() =>
				(document.activeElement as HTMLElement)?.blur(),
			);
			await installRing(page);
			await target.evaluate((el) => {
				const w = window as any;
				w.__before = new WeakMap();
				for (let e: Element | null = el; e; e = e.parentElement)
					w.__before.set(e, {
						ring: w.__ring(e),
						background: getComputedStyle(e).backgroundColor,
					});
			});
			await target.evaluate((el) =>
				el.scrollIntoView({
					block:
						el.getBoundingClientRect().height > innerHeight / 2
							? "start"
							: "center",
				}),
			);
			const point = await target.evaluate((el) => {
				const r = el.getBoundingClientRect();
				const y = r.y + Math.min(12, r.height / 2);
				for (const x of [r.x + 4, r.right - 4, r.x + r.width / 2]) {
					const hit = document.elementFromPoint(x, y);
					let plain = hit !== null && el.contains(hit);
					for (let e = hit; plain && e && e !== el; e = e.parentElement)
						if (
							e.matches(
								"a, button, input, .cm-underline, [contenteditable=false]",
							)
						)
							plain = false;
					if (plain) return { x, y };
				}
				return null;
			});
			if (!point) continue;
			await page.mouse.click(point.x, point.y);
			await page.mouse.move(-10, -10);
			await page.waitForTimeout(250);
			clicked.push(
				await page.evaluate(() => {
					const w = window as any;
					const active = document.activeElement as HTMLElement | null;
					const label = (e: Element) =>
						`${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join(".")}`;
					const rings: string[] = [];
					const fills: string[] = [];
					for (
						let e: Element | null = active;
						e && e !== document.body;
						e = e.parentElement
					) {
						const before = w.__before.get(e) ?? { ring: "", background: "" };
						const ring = w.__ring(e);
						if (ring && ring !== before.ring)
							rings.push(`${label(e)}: ${ring}`);
						const background = getComputedStyle(e).backgroundColor;
						if (before.background && background !== before.background)
							fills.push(`${label(e)}: ${before.background} to ${background}`);
					}
					return {
						focused: active ? label(active) : "none",
						editable: active?.matches(":read-write") ?? false,
						rings,
						fills,
					};
				}),
			);
		} catch (error) {
			if (!(error instanceof errors.TimeoutError)) throw error;
			left++;
		}
	}
	page.setDefaultTimeout(30000);
	await page.evaluate(() => {
		for (const el of document.querySelectorAll("[data-ring-target]"))
			el.removeAttribute("data-ring-target");
	});
	const problems = clicked.flatMap((c) => [
		...(c.editable ? [] : [`clicking reached ${c.focused}, not editable text`]),
		...(c.rings as string[]).map((r) => `clicking ${c.focused} rings ${r}`),
		...(c.fills as string[]).map((f) => `clicking ${c.focused} fills ${f}`),
	]);
	if (clicked.length === 0)
		return { pass: false, reason: `no visible ${selector}`, facts: {} };
	return {
		pass: problems.length === 0,
		reason:
			problems.length === 0
				? `no ring or fill around ${clicked.map((c) => c.focused).join(", ")}${left ? `; ${left} left the DOM before their click` : ""}`
				: problems.join(" | "),
		facts: { clicked, left },
	};
};

const tableFits = async (page: Page, table: string, column: string) => {
	const m = await page.evaluate(
		({ table, column }) => {
			const t = document.querySelector(table) as HTMLElement | null;
			const c = document.querySelector(column);
			if (!t || !c) return null;
			t.scrollIntoView({ block: "center" });
			return {
				table: Math.round(t.getBoundingClientRect().width * 10) / 10,
				column: Math.round(c.getBoundingClientRect().width * 10) / 10,
			};
		},
		{ table, column },
	);
	if (!m) return { pass: false, reason: `no ${table} or ${column}`, facts: {} };
	const pass = Math.abs(m.table - m.column) <= 1;
	return {
		pass,
		reason: `table ${m.table}px, column ${m.column}px`,
		facts: m,
	};
};

const editChecks: EditCheck[] = [
	{
		id: "text-focus",
		view: "live",
		open: "search",
		shot: ":focus",
		run: (page) => ringsOnClick(page, ":read-write"),
	},
	{
		id: "property-select",
		view: "live",
		shot: ".workspace-leaf.mod-active .metadata-container",
		run: selectRows,
	},
	{
		id: "control-focus",
		view: "live",
		shot: ":focus",
		run: async (page) => {
			await page.evaluate(() =>
				(document.activeElement as HTMLElement)?.blur(),
			);
			for (let i = 0; i < 60; i++) {
				await page.keyboard.press("Tab");
				const hit = await page.evaluate(() => {
					const el = document.activeElement as HTMLElement | null;
					if (!el || el === document.body || el.isContentEditable) return null;
					if (el.matches("input, textarea, select")) return null;
					const cs = getComputedStyle(el);
					return {
						element: `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`,
						focusVisible: el.matches(":focus-visible"),
						style: cs.outlineStyle,
						width: Number.parseFloat(cs.outlineWidth),
					};
				});
				if (hit)
					return {
						pass: drawsOutline(hit),
						reason: drawsOutline(hit)
							? `${hit.element} reached by Tab shows a ${hit.width}px outline`
							: `${hit.element} reached by Tab shows no outline`,
						facts: { ...hit, tabs: i + 1 },
					};
			}
			return {
				pass: false,
				reason: "Tab reached no control in 60 presses",
				facts: {},
			};
		},
	},
	{
		id: "reading-table",
		view: "reading",
		shot: ".markdown-reading-view table",
		run: (page) =>
			tableFits(
				page,
				".markdown-reading-view table",
				".markdown-reading-view .markdown-preview-sizer > div > p",
			),
	},
	{
		id: "live-table",
		view: "live",
		shot: ".cm-content .cm-table-widget table",
		run: (page) =>
			tableFits(
				page,
				".cm-content .cm-table-widget table",
				".cm-content > .cm-line",
			),
	},
	{
		id: "code-active-line",
		view: "live",
		shot: ".cm-line.cm-active",
		run: async (page) => {
			const m = await page.evaluate(async () => {
				const editor = (window as any).app.workspace.activeLeaf.view.editor;
				const lines: string[] = editor.getValue().split("\n");
				const fence = lines.findIndex((l) => /^```\S/.test(l));
				if (fence < 0) return null;
				editor.setCursor({ line: fence + 1, ch: 0 });
				editor.focus();
				await new Promise((r) => setTimeout(r, 400));
				const active = document.querySelector(
					".cm-line.cm-active",
				) as HTMLElement | null;
				const other = document.querySelector(
					".cm-line.HyperMD-codeblock-bg:not(.cm-active)",
				);
				if (!active || !other) return null;
				active.scrollIntoView({ block: "center" });
				return {
					line: fence + 2,
					active: getComputedStyle(active).backgroundColor,
					other: getComputedStyle(other).backgroundColor,
				};
			});
			if (!m)
				return {
					pass: false,
					reason: "no code block line to put the cursor on",
					facts: {},
				};
			return {
				pass: m.active === m.other,
				reason:
					m.active === m.other
						? `the active code line keeps the block's ${m.other}`
						: `the active code line is ${m.active}, the block's other lines ${m.other}`,
				facts: m,
			};
		},
	},
];

const vaultFiles = (vault: string): Map<string, Buffer> =>
	new Map(
		readdirSync(vault, { recursive: true, encoding: "utf8" })
			.filter(
				(name) =>
					!name.startsWith(".obsidian") && statSync(join(vault, name)).isFile(),
			)
			.map((name) => [name, readFileSync(join(vault, name))]),
	);

function restoreVault(vault: string, before: Map<string, Buffer>): string[] {
	const now = vaultFiles(vault);
	const undone: string[] = [];
	for (const name of now.keys())
		if (!before.has(name)) {
			rmSync(join(vault, name));
			undone.push(`removed ${name}`);
		}
	for (const [name, content] of before)
		if (!now.get(name)?.equals(content)) {
			writeFileSync(join(vault, name), content);
			undone.push(`restored ${name}`);
		}
	return undone;
}

async function editcheck(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: {
			run: { type: "string" },
			scheme: { type: "string", default: "light" },
			note: { type: "string", default: "lab-note-ko" },
		},
	});
	if (!values.run) fail("editcheck needs --run <run>");
	if (values.scheme !== "light" && values.scheme !== "dark")
		fail(`--scheme must be light or dark, not ${values.scheme}`);
	const state = readState(values.run);
	if (!alive(state.pid))
		fail(`run "${values.run}" is not live; launch it again`);
	const before = vaultFiles(state.vault);
	const { browser, page } = await connect(state);
	const cdp = await page.context().newCDPSession(page);
	const report: Record<string, Outcome & { shot?: string }> = {};
	let undone: string[] = [];
	try {
		for (const check of editChecks) {
			const prepared = await prepare(page, {
				width: 1440,
				height: 900,
				mobile: false,
				note: values.note,
				view: check.view,
				scheme: values.scheme,
				hideRight: true,
				open: check.open ?? "none",
			});
			if ("error" in prepared) fail(prepared.error);
			await page.waitForTimeout(600);
			const outcome = await check.run(page);
			await page.waitForTimeout(200);
			const box = await page.evaluate((s) => {
				const el = document.querySelector(s);
				if (!el) return null;
				const r = el.getBoundingClientRect();
				return { x: r.x, y: r.y, width: r.width, height: r.height };
			}, check.shot);
			const entry: Outcome & { shot?: string } = outcome;
			if (box && box.width > 0) {
				const pad = 24;
				const shot = join(
					state.runDir,
					"shots",
					`editcheck-${values.scheme}-${check.id}.png`,
				);
				const { data } = await cdp.send("Page.captureScreenshot", {
					format: "png",
					clip: {
						x: Math.max(0, box.x - pad),
						y: Math.max(0, box.y - pad),
						width: box.width + 2 * pad,
						height: box.height + 2 * pad,
						scale: 2,
					},
				});
				mkdirSync(dirname(shot), { recursive: true });
				writeFileSync(shot, Buffer.from(data, "base64"));
				entry.shot = shot;
			}
			report[check.id] = entry;
			await page.evaluate(() =>
				(document.activeElement as HTMLElement)?.blur(),
			);
		}
	} finally {
		await page.evaluate(async () => {
			const app = (window as any).app;
			for (const leaf of app.workspace.getLeavesOfType("markdown"))
				await leaf.view.save?.();
		});
		undone = restoreVault(state.vault, before);
	}
	await page.keyboard.press("Escape");
	if (state.hidden) await conceal(page);
	await browser.close();
	for (const line of undone) console.log(`VAULT ${line}`);
	const path = join(state.runDir, `editcheck-${values.scheme}.json`);
	writeFileSync(path, JSON.stringify(report, null, 2));
	const failed = Object.entries(report).filter(([, o]) => !o.pass);
	for (const [id, o] of Object.entries(report))
		console.log(`${o.pass ? "ok  " : "FAIL"} ${id}: ${o.reason}`);
	console.log(`REPORT ${path}`);
	console.log(
		failed.length === 0 ? "EDITCHECK ok" : `EDITCHECK fail ${failed.length}`,
	);
	if (failed.length > 0) process.exit(1);
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
	case "editcheck":
		await editcheck(rest);
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
			"usage: obsidian.ts <launch|doctor|shot|compare|layers|editcheck|sync|stop> [options]",
		);
}
