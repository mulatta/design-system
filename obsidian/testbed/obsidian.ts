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
import {
	type Browser,
	type CDPSession,
	chromium,
	errors,
	type Page,
} from "playwright-core";
import { buildTheme } from "../theme/build.ts";

const testbed = dirname(fileURLToPath(import.meta.url));
const repo = process.cwd();
const verifyRoot = join(repo, "build", "verify");

type InstalledPlugin = { attr: string; id: string };

type RunState = {
	pid: number;
	port: number;
	runDir: string;
	vault: string;
	theme: string;
	snippets: string[];
	plugins: InstalledPlugin[];
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
	return { plugins: [], ...JSON.parse(readFileSync(file, "utf8")) } as RunState;
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

function buildPlugin(attr: string): string {
	const built = spawnSync(
		"nix",
		[
			"build",
			`.#${attr}`,
			"-o",
			join("build", "plugins", attr),
			"--print-out-paths",
		],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
	);
	if (built.status !== 0) fail(`nix build .#${attr} failed`);
	return built.stdout.trim();
}

function pluginDir(vault: string, id: string): string {
	return join(vault, ".obsidian", "plugins", id);
}

function installPlugins(vault: string, attrs: string[]): InstalledPlugin[] {
	return attrs.map((attr) => {
		const out = buildPlugin(attr);
		const manifest = join(out, "manifest.json");
		if (!existsSync(manifest))
			fail(`.#${attr} is not an Obsidian plugin: ${manifest} is missing`);
		const { id } = JSON.parse(readFileSync(manifest, "utf8")) as { id: string };
		const dir = pluginDir(vault, id);
		mkdirSync(dir, { recursive: true });
		for (const name of readdirSync(out))
			writeFileSync(join(dir, name), readFileSync(join(out, name)));
		return { attr, id };
	});
}

async function startPlugins(page: Page, ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	await page.evaluate(async (ids) => {
		const plugins = (window as any).app.plugins;
		await plugins.setEnable(true);
		await plugins.loadManifests();
		for (const id of ids) {
			await plugins.disablePlugin(id);
			await plugins.enablePluginAndSave(id);
		}
	}, ids);
	await page.waitForFunction(
		(ids) =>
			ids.every(
				(id) => (window as any).app.plugins.plugins[id]?._loaded === true,
			),
		ids,
		{ timeout: 15000, polling: 250 },
	);
}

function installCurrent(state: RunState): boolean {
	const installed = (path: string) =>
		existsSync(path) ? readFileSync(path, "utf8") : "";
	if (
		state.theme === "wongoji" &&
		!installed(
			join(state.vault, ".obsidian", "themes", "Wongoji", "theme.css"),
		).includes(buildTheme())
	)
		return false;
	if (
		!state.snippets.every((path) =>
			installed(
				join(state.vault, ".obsidian", "snippets", basename(path)),
			).startsWith(readFileSync(path, "utf8")),
		)
	)
		return false;
	return state.plugins.every(({ attr, id }) => {
		const out = buildPlugin(attr);
		return readdirSync(out).every(
			(name) =>
				installed(join(pluginDir(state.vault, id), name)) ===
				readFileSync(join(out, name), "utf8"),
		);
	});
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
	if (
		state.theme !== "wongoji" &&
		state.snippets.length === 0 &&
		state.plugins.length === 0
	)
		fail("this run has no theme, snippet, or plugin to sync");
	const token = `sync-${Date.now()}`;
	installStyles(state.vault, state.theme, state.snippets, token);
	installPlugins(
		state.vault,
		state.plugins.map((p) => p.attr),
	);
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
	await startPlugins(
		page,
		state.plugins.map((p) => p.id),
	).catch(async (error) => {
		await browser.close();
		fail(`Obsidian did not reload the synced plugins: ${error}`);
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
			plugin: { type: "string", multiple: true, default: [] },
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
	const plugins = installPlugins(vault, values.plugin);
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
		plugins,
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
		await startPlugins(
			page,
			plugins.map((p) => p.id),
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
					enabledPlugins: Object.keys(app?.plugins?.plugins ?? {}),
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
	report.installCurrent = installCurrent(state);
	const enabled = (report.enabledPlugins ?? []) as string[];
	const ok =
		report.processAlive === true &&
		typeof report.cdp === "string" &&
		(report.cdp as string).includes("obsidian") &&
		report.layoutReady === true &&
		report.vaultPath === state.vault &&
		(state.theme !== "wongoji" || report.cssTheme === "Wongoji") &&
		state.plugins.every((p) => enabled.includes(p.id)) &&
		report.installCurrent === true;
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
			if (app.isMobile) {
				for (const split of [app.workspace.leftSplit, app.workspace.rightSplit])
					if (split && !split.collapsed) {
						split.collapse();
						await new Promise((r) => setTimeout(r, 400));
					}
			} else if (explorer) await app.workspace.revealLeaf(explorer);
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
	palette: { command: "command-palette:open", shown: ".prompt" },
	settings: { command: "app:open-settings", shown: null },
	search: {
		command: "global-search:open",
		shown: '.workspace-leaf-content[data-type="search"] input',
	},
} as const;

type Panel = keyof typeof panels;

function isPanel(value: string): value is Panel {
	return Object.hasOwn(panels, value);
}

async function openPanel(page: Page, open: string): Promise<void> {
	if (!isPanel(open))
		fail(`unknown --open ${open} (${Object.keys(panels).join("|")})`);
	const panel = panels[open];
	if (!panel) return;
	const shown = () =>
		page.evaluate(
			(s) => !!document.querySelector(s)?.checkVisibility(),
			panel.shown ?? "",
		);
	for (let attempt = 0; attempt < 3; attempt++) {
		await page.evaluate(
			(id) => (window as any).app.commands.executeCommandById(id),
			panel.command,
		);
		if (!panel.shown) return;
		for (let i = 0; i < 10; i++) {
			if (await shown()) {
				await page.waitForTimeout(500);
				if (await shown()) return;
				break;
			}
			await page.waitForTimeout(100);
		}
	}
	fail(`--open ${open} did not show ${panel.shown}`);
}

async function settingsPage(
	browser: Browser,
	page: Page,
): Promise<Page | null> {
	if (
		await page.evaluate(() => !!document.querySelector(".modal.mod-settings"))
	)
		return page;
	const pages = () => browser.contexts().flatMap((c) => c.pages());
	const isSettings = (p: Page) => p !== page && !p.url().startsWith("app://");
	let settings = pages().find(isSettings);
	for (let i = 0; i < 80 && !settings; i++) {
		await page.waitForTimeout(125);
		settings = pages().find(isSettings);
	}
	await settings?.waitForLoadState();
	return settings ?? null;
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
	const settings =
		values.open === "settings" ? await settingsPage(browser, page) : null;
	if (values.open === "settings" && !settings) {
		await browser.close();
		fail("settings window did not open");
	}
	if (settings && settings !== page) {
		if (state.hidden) await conceal(page);
		await settings.setViewportSize({ width, height });
		await clearSearch(settings);
		await settings.waitForTimeout(700);
		await clearSearch(settings);
		await settings.screenshot({ path: name });
		await settings.close();
	} else {
		if (settings) {
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

type View = "reading" | "live";
type Layout = "desktop" | "mobile";
type Where = string | Partial<Record<View, string>>;

const everywhere: Layout[] = ["desktop", "mobile"];
const mobileOnly: Layout[] = ["mobile"];
const leaf = ".workspace-leaf.mod-active";
const reading = `${leaf} .markdown-reading-view`;
const live = `${leaf} .markdown-source-view.is-live-preview`;
const inNote = (selector: string): Where => ({
	reading: `${reading} ${selector}`,
	live: `${live} ${selector}`,
});

const selectorIn = (where: Where, view: View): string | undefined =>
	typeof where === "string" ? where : where[view];

const runsOn = (row: { on?: Layout[] }, layout: Layout): boolean =>
	(row.on ?? ["desktop"]).includes(layout);

const placed = <T extends { on?: Layout[] }>(
	rows: T[],
	where: (row: T) => Where,
	view: View,
	layout: Layout,
): { row: T; selector: string }[] =>
	rows.flatMap((row) => {
		const selector = selectorIn(where(row), view);
		return selector !== undefined && runsOn(row, layout)
			? [{ row, selector }]
			: [];
	});

function screenFor(mobile: boolean, size?: string) {
	const fallback = mobile ? "390x844" : "1440x900";
	const match = /^(\d+)x(\d+)$/.exec(size ?? fallback);
	if (!match) fail(`bad --size ${size} (WIDTHxHEIGHT, e.g. ${fallback})`);
	const layout: Layout = mobile ? "mobile" : "desktop";
	return { layout, mobile, width: Number(match[1]), height: Number(match[2]) };
}

function placeFor(view: string, mobile: boolean, size?: string) {
	if (view !== "reading" && view !== "live")
		fail(`unknown --view ${view} (reading|live)`);
	return {
		...screenFor(mobile, size),
		view: view as View,
		tag: mobile ? `${view}-mobile` : view,
	};
}

type Part = {
	id: string;
	note: string;
	root: Where;
	on?: Layout[];
	last?: boolean;
	pad: [number, number, number, number];
	rightEdge?: number;
	maxHeight?: number;
	measure: Record<string, string>;
};

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
		root: inNote(".inline-title"),
		on: everywhere,
		pad: [8, 24, 28, 8],
		measure: {},
	},
	{
		id: "properties",
		note: "elements-ko",
		root: inNote(".metadata-properties"),
		on: everywhere,
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
		root: { reading: `${reading} ul.contains-task-list` },
		on: everywhere,
		last: true,
		pad: [6, 8, 6, 40],
		measure: {
			item: "li:nth-child(1)",
			box: "li:nth-child(1) .task-list-item-checkbox",
			doneBox: "li.is-checked .task-list-item-checkbox",
		},
	},
	{
		id: "task-line",
		note: "elements-ko",
		root: { live: `${live} .HyperMD-task-line` },
		on: everywhere,
		pad: [6, 8, 60, 40],
		measure: {
			label: ".task-list-label",
			box: ".task-list-item-checkbox",
		},
	},
	{
		id: "heading",
		note: "lab-note-ko",
		root: { reading: `${reading} h2`, live: `${live} .HyperMD-header-2` },
		on: everywhere,
		pad: [8, 8, 8, 32],
		measure: {},
	},
	{
		id: "code-top",
		note: "lab-note-ko",
		root: {
			reading: `${reading} .el-pre:not(.mod-frontmatter) pre`,
			live: `${live} .HyperMD-codeblock-begin`,
		},
		on: everywhere,
		pad: [12, 12, 32, 12],
		maxHeight: 64,
		measure: {},
	},
	{
		id: "callout",
		note: "lab-note-ko",
		root: {
			reading: `${reading} .callout`,
			live: `${live} .cm-callout .callout`,
		},
		on: everywhere,
		pad: [12, 12, 12, 12],
		measure: {},
	},
	{
		id: "table",
		note: "lab-note-ko",
		root: {
			reading: `${reading} table`,
			live: `${live} .cm-table-widget table`,
		},
		on: everywhere,
		pad: [8, 8, 8, 8],
		measure: { head: "thead th", cell: "tbody td" },
	},
	{
		id: "navbar",
		note: "lab-note-ko",
		root: { reading: ".mobile-navbar" },
		on: mobileOnly,
		pad: [8, 8, 8, 8],
		measure: {
			actions: ".mobile-navbar-actions",
			back: ".mobile-navbar-action-back",
			icon: ".mobile-navbar-action-back svg",
		},
	},
	{
		id: "top-buttons",
		note: "lab-note-ko",
		root: { reading: `${leaf} .view-header` },
		on: mobileOnly,
		pad: [4, 0, 8, 0],
		measure: {
			sidebar: ".mod-left-split-toggle",
			actions: ".view-actions",
			more: ".view-actions .view-action:last-child",
		},
	},
];

type Box = { x: number; y: number; w: number; h: number };
type Measured = { root: Box; boxes: Record<string, Box | null> };

const installFind = (page: Page) =>
	page.evaluate(() => {
		(window as any).__wgFind = async (selector: string, last = false) => {
			const visible = () =>
				[...document.querySelectorAll(selector)].filter((e) =>
					e.checkVisibility(),
				);
			const scroller = [
				...document.querySelectorAll<HTMLElement>(
					".workspace-leaf.mod-active .markdown-preview-view, .workspace-leaf.mod-active .cm-scroller",
				),
			].find((e) => e.checkVisibility());
			if (scroller) scroller.scrollTop = 0;
			let found: Element[] = [];
			for (let before = -1; scroller?.scrollTop !== before; ) {
				await new Promise((r) => setTimeout(r, 150));
				found = visible();
				if (found.length > 0 || !scroller) break;
				before = scroller.scrollTop;
				scroller.scrollTop += scroller.clientHeight * 0.7;
			}
			return (last ? found[found.length - 1] : found[0]) ?? null;
		};
	});

async function measurePart(
	page: Page,
	part: Part,
	selector: string,
): Promise<Measured | null> {
	await installFind(page);
	return page.evaluate(
		async ({ p, selector }) => {
			const root = (await (window as any).__wgFind(
				selector,
				p.last,
			)) as HTMLElement | null;
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
		},
		{ p: part, selector },
	);
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
			view: { type: "string", default: "reading" },
			mobile: { type: "boolean", default: false },
			size: { type: "string" },
		},
	});
	const { view, layout, mobile, width, height, tag } = placeFor(
		values.view,
		values.mobile,
		values.size,
	);
	const here = placed(parts, (p) => p.root, view, layout);
	const chosen =
		values.part.length > 0
			? here.filter(({ row }) => values.part.includes(row.id))
			: here;
	if (chosen.length === 0)
		fail(
			`no part matches in ${tag}; parts: ${here.map(({ row }) => row.id).join(", ")}`,
		);
	const outDir = join(verifyRoot, "compare", tag, values.scheme);
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
		for (const { row: part, selector } of chosen) {
			const prepared = await prepare(page, {
				width,
				height,
				mobile,
				note: part.note,
				view,
				scheme: values.scheme,
				open: "none",
				hideRight: true,
			});
			if ("error" in prepared) fail(prepared.error);
			await page.waitForTimeout(500);
			const measured = await measurePart(page, part, selector);
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
	for (const { row: part } of chosen) {
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

type Region = {
	id: string;
	selector: Where;
	on?: Layout[];
	palette?: boolean;
};

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
	{ id: "view-header", selector: `.mod-root ${leaf} .view-header` },
	{
		id: "note",
		selector: {
			reading: `${reading} .markdown-preview-view`,
			live: `${live} .cm-scroller`,
		},
		on: everywhere,
	},
	{ id: "status-bar", selector: ".status-bar" },
	{
		id: "property-key",
		selector: inNote(".metadata-property-key"),
		on: everywhere,
	},
	{
		id: "code",
		selector: {
			reading: `${reading} .el-pre:not(.mod-frontmatter) pre`,
			live: `${live} .HyperMD-codeblock-bg:not(.HyperMD-codeblock-begin)`,
		},
		on: everywhere,
	},
	{
		id: "inline-code",
		selector: { reading: `${reading} p code`, live: `${live} .cm-inline-code` },
		on: everywhere,
	},
	{
		id: "table-head",
		selector: {
			reading: `${reading} thead th`,
			live: `${live} .cm-table-widget thead th`,
		},
		on: everywhere,
	},
	{
		id: "callout",
		selector: {
			reading: `${reading} .callout`,
			live: `${live} .cm-callout .callout`,
		},
		on: everywhere,
	},
	{ id: "navbar", selector: { reading: ".mobile-navbar" }, on: mobileOnly },
	{
		id: "top-buttons",
		selector: { reading: `${leaf} .view-actions` },
		on: mobileOnly,
	},
	{ id: "palette", selector: ".prompt", palette: true, on: everywhere },
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
	["callout", "code"],
	["note", "navbar"],
	["note", "top-buttons"],
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

const linear = (c: number) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function contrast(a: Rgba, b: Rgba): number {
	const luminance = ([r, g, b]: Rgba) =>
		0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

function oklchL([r, g, b]: Rgba): number {
	const [R, G, B] = [linear(r), linear(g), linear(b)];
	const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
	const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
	const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
	return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

const hex = ([r, g, b]: Rgba) =>
	`#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

const installPaint = (page: Page) =>
	page.evaluate(() => {
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
		const w = window as any;
		w.__wgParse = parse;
		w.__wgOver = over;
		w.__wgGround = (el: Element) => {
			const chain: Element[] = [];
			for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
			let bg: number[] = [255, 255, 255, 1];
			for (const e of chain.reverse()) {
				const c = parse(getComputedStyle(e).backgroundColor);
				if (c[3] > 0) bg = over(c, bg);
			}
			return bg;
		};
	});

async function readRegion(
	page: Page,
	selector: string,
): Promise<RegionStyle | null> {
	await installFind(page);
	await installPaint(page);
	return page.evaluate(async (sel) => {
		const w = window as any;
		const el = (await w.__wgFind(sel)) as HTMLElement | null;
		if (!el) return null;
		const parse = w.__wgParse as (css: string) => Rgba;
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
			background: w.__wgGround(el) as Rgba,
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
			view: { type: "string", default: "reading" },
			mobile: { type: "boolean", default: false },
			threshold: { type: "string", default: "0.025" },
		},
	});
	const { view, layout, mobile, width, height, tag } = placeFor(
		values.view,
		values.mobile,
	);
	const here = placed(regions, (r) => r.selector, view, layout);
	const state = readState(values.run);
	if (!alive(state.pid))
		fail(`run "${values.run}" is not live; launch it again`);
	const { browser, page } = await connect(state);
	const base = {
		width,
		height,
		mobile,
		note: values.note,
		view,
		scheme: values.scheme,
		hideRight: true,
	};
	const found: Record<string, RegionStyle | null> = {};
	for (const palette of [false, true]) {
		const prepared = await prepare(page, {
			...base,
			open: palette ? "palette" : "none",
		});
		if ("error" in prepared) fail(prepared.error);
		await page.waitForTimeout(500);
		for (const { row, selector } of here)
			if (!!row.palette === palette)
				found[row.id] = await readRegion(page, selector);
	}
	await page.keyboard.press("Escape");
	if (state.hidden) await conceal(page);
	await browser.close();

	const threshold = Number(values.threshold);
	const lines: string[] = [
		`regions (${values.run}, ${tag}, ${values.scheme}): background, L, borders`,
	];
	for (const { row: r } of here) {
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
	const pairs = boundaries
		.filter(([a, b]) => a in found && b in found)
		.map(([a, b]) => {
			const sa = found[a];
			const sb = found[b];
			const dL =
				sa && sb
					? Math.abs(oklchL(sa.background) - oklchL(sb.background))
					: null;
			return { a, b, dL };
		});
	for (const { a, b, dL } of pairs)
		lines.push(
			`  ${`${a} | ${b}`.padEnd(26)} ${dL === null ? "missing" : `${dL.toFixed(3)}${dL < threshold ? "  < threshold" : ""}`}`,
		);
	const outDir = join(verifyRoot, "layers");
	mkdirSync(outDir, { recursive: true });
	writeFileSync(
		join(outDir, `${values.run}-${tag}-${values.scheme}.json`),
		JSON.stringify(
			{ view, layout, regions: found, boundaries: pairs },
			null,
			2,
		),
	);
	console.log(lines.join("\n"));
}

type JoinKind = "cut" | "mark";

type Join = {
	id: string;
	notes: string[];
	root: Where;
	on?: Layout[];
	colour: string;
	kind: JoinKind;
	box?: "::after";
};

const joins: Join[] = [
	{
		id: "delete-loop",
		notes: ["elements-ko", "elements-en"],
		root: { reading: `${reading} del`, live: `${live} .cm-strikethrough` },
		on: everywhere,
		colour: "var(--wg-proof)",
		kind: "mark",
	},
	{
		id: "title-rule",
		notes: ["lab-note-ko", "long-note"],
		root: inNote(".inline-title"),
		on: everywhere,
		colour: "var(--wg-rule)",
		kind: "cut",
		box: "::after",
	},
	{
		id: "code-top",
		notes: ["lab-note-ko", "elements-ko"],
		root: { reading: `${reading} .el-pre:not(.mod-frontmatter) pre` },
		on: everywhere,
		colour: "var(--wg-rule)",
		kind: "cut",
	},
	{
		id: "callout",
		notes: ["lab-note-ko", "elements-ko"],
		root: inNote(".callout"),
		on: everywhere,
		colour: "rgb(var(--callout-color))",
		kind: "cut",
	},
	{
		id: "doc-tab",
		notes: ["lab-note-ko"],
		root: ".mod-root .workspace-tab-header.is-active",
		colour: "var(--wg-rule)",
		kind: "cut",
	},
];

type Band = { top: number; bottom: number };
type JoinSite = {
	key: string;
	label: string;
	colour: string;
	join: number;
	before: [number, number];
	after: [number, number];
	top: number;
	bottom: number;
	slope: number;
};

const installJoins = (page: Page) =>
	page.evaluate(() => {
		const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
		const locate = (
			el: HTMLElement,
			kind: JoinKind,
			box: string | undefined,
			colour: string,
		) => {
			const probe = document.createElement("span");
			probe.style.color = colour;
			el.append(probe);
			const rgb = getComputedStyle(probe).color;
			probe.remove();
			const label = (el.textContent ?? "").trim().slice(0, 24);
			if (kind === "mark") {
				const lines = [...el.getClientRects()];
				const line = lines[lines.length - 1];
				const after = getComputedStyle(el, "::after");
				const mark = Number.parseFloat(after.width);
				const text = document.createRange();
				text.selectNodeContents(el);
				const ends = [...text.getClientRects()];
				const end = ends[ends.length - 1].right;
				const join = end + Number.parseFloat(after.marginLeft);
				return {
					label,
					colour: rgb,
					join,
					before: [join - 0.6 * mark, join - 0.05 * mark],
					after: [Math.max(join, end) + 0.05 * mark, join + 0.3 * mark],
					top: line.top,
					bottom: line.bottom,
					slope: 0,
				};
			}
			let r = el.getBoundingClientRect();
			if (box) {
				const ps = getComputedStyle(el, box);
				r = new DOMRect(
					r.left + Number.parseFloat(ps.left),
					r.top + Number.parseFloat(ps.top),
					Number.parseFloat(ps.width),
					Number.parseFloat(ps.height),
				);
			}
			const cut = Number.parseFloat(
				getComputedStyle(el).getPropertyValue("--wg-cut"),
			);
			const join = r.right - cut;
			return {
				label,
				colour: rgb,
				join,
				before: [join - 5, join - 3],
				after: [join + 3, join + 5],
				top: r.top,
				bottom: r.top + cut,
				slope: 1,
			};
		};
		(window as any).__wgJoinNext = async (
			selector: string,
			kind: JoinKind,
			box: string | undefined,
			colour: string,
			seen: string[],
		) => {
			const scroller =
				[
					...document.querySelectorAll<HTMLElement>(
						".workspace-leaf.mod-active .markdown-preview-view, .workspace-leaf.mod-active .cm-scroller",
					),
				].find((e) => e.checkVisibility()) ?? null;
			if (seen.length === 0 && scroller) {
				scroller.scrollTop = 0;
				await wait(300);
			}
			const keyOf = (el: Element) =>
				`${Math.round(el.getBoundingClientRect().left)}:${el.textContent}`;
			for (;;) {
				const next = [...document.querySelectorAll<HTMLElement>(selector)].find(
					(e) =>
						e.checkVisibility() &&
						!seen.includes(keyOf(e)) &&
						(kind !== "mark" ||
							getComputedStyle(e, "::after").content !== "none"),
				);
				if (next) {
					const key = keyOf(next);
					next.scrollIntoView({ block: "center" });
					await wait(400);
					return { key, ...locate(next, kind, box, colour) };
				}
				if (!scroller) return null;
				const before = scroller.scrollTop;
				scroller.scrollTop += scroller.clientHeight * 0.7;
				await wait(250);
				if (scroller.scrollTop === before) return null;
			}
		};
		(window as any).__wgJoinBands = async (
			data: string,
			clip: { x: number; y: number; width: number },
			site: JoinSite,
		) => {
			const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
			const bitmap = await createImageBitmap(
				new Blob([bytes], { type: "image/png" }),
			);
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
			ctx.drawImage(bitmap, 0, 0);
			const scale = bitmap.width / clip.width;
			const {
				data: px,
				width,
				height,
			} = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
			const target = (site.colour.match(/[\d.]+/g) ?? [])
				.slice(0, 3)
				.map(Number);
			const at = (c: number, r: number) =>
				[0, 1, 2].map((k) => px[(r * width + c) * 4 + k]);
			const dist = (a: number[], b: number[]) =>
				Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
			const coverage = (c: number) => {
				const column = Array.from({ length: height }, (_, r) => at(c, r));
				const paper = column.reduce((far, p) =>
					dist(p, target) > dist(far, target) ? p : far,
				);
				const span = target.map((t, k) => t - paper[k]);
				const norm = Math.hypot(...span);
				return column.map((p) => {
					const d = p.map((v, k) => v - paper[k]);
					const a =
						(d[0] * span[0] + d[1] * span[1] + d[2] * span[2]) / norm ** 2;
					const off = Math.hypot(...d.map((v, k) => v - a * span[k]));
					return a > 0 && off <= 0.2 * a * norm ? Math.min(1, a) : 0;
				});
			};
			const r0 = Math.max(0, Math.floor((site.top - clip.y) * scale));
			const r1 = Math.min(height, Math.ceil((site.bottom - clip.y) * scale));
			const band = (
				[x0, x1]: [number, number],
				slope: number,
				near: number | null,
			): Band | null => {
				const cov = new Array(height).fill(0);
				const c0 = Math.max(0, Math.ceil((x0 - clip.x) * scale));
				const c1 = Math.min(width - 1, Math.floor((x1 - clip.x) * scale));
				for (let c = c0; c <= c1; c++) {
					const column = coverage(c);
					const x = clip.x + (c + 0.5) / scale;
					const shift = Math.round(slope * (x - site.join) * scale);
					for (let r = r0; r < r1; r++) {
						const v = column[r + shift] ?? 0;
						if (v > cov[r]) cov[r] = v;
					}
				}
				const runs: { start: number; end: number; sum: number }[] = [];
				for (let r = r0; r < r1; r++) {
					if (cov[r] < 0.2) continue;
					const last = runs[runs.length - 1];
					if (last && last.end === r - 1) {
						last.end = r;
						last.sum += cov[r];
					} else runs.push({ start: r, end: r, sum: cov[r] });
				}
				if (runs.length === 0) return null;
				const edges = (run: { start: number; end: number }) => ({
					top: clip.y + (run.start + 1 - cov[run.start]) / scale - site.top,
					bottom: clip.y + (run.end + cov[run.end]) / scale - site.top,
				});
				const pick =
					near === null
						? runs.reduce((a, b) => (b.sum > a.sum ? b : a))
						: runs.reduce((a, b) =>
								Math.abs(edges(b).top - near) < Math.abs(edges(a).top - near)
									? b
									: a,
							);
				return edges(pick);
			};
			const before = band(site.before, 0, null);
			const after = band(site.after, site.slope, before?.top ?? null);
			return { before, after };
		};
	});

const joinEdges: Record<JoinKind, (keyof Band)[]> = {
	cut: ["top"],
	mark: ["top", "bottom"],
};

async function checkJoins(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: {
			run: { type: "string", default: "agent" },
			scheme: { type: "string", default: "light" },
			view: { type: "string", default: "reading" },
			mobile: { type: "boolean", default: false },
		},
	});
	if (values.scheme !== "light" && values.scheme !== "dark")
		fail(`--scheme must be light or dark, not ${values.scheme}`);
	const { view, layout, mobile, width, height, tag } = placeFor(
		values.view,
		values.mobile,
	);
	const here = placed(joins, (j) => j.root, view, layout);
	const state = readState(values.run);
	if (!alive(state.pid))
		fail(`run "${values.run}" is not live; launch it again`);
	const outDir = join(
		verifyRoot,
		"joins",
		`${values.run}-${tag}-${values.scheme}`,
	);
	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });
	const { browser, page } = await connect(state);
	const cdp = await page.context().newCDPSession(page);
	const report: {
		id: string;
		note: string;
		label: string;
		pass: boolean;
		before: Band | null;
		after: Band | null;
		shot: string;
	}[] = [];
	const lines: string[] = [];
	for (const { row, selector } of here) {
		for (const note of row.notes) {
			const prepared = await prepare(page, {
				width,
				height,
				mobile,
				note,
				view,
				scheme: values.scheme,
				open: "none",
				hideRight: true,
			});
			if ("error" in prepared) fail(prepared.error);
			await page.waitForTimeout(500);
			await installJoins(page);
			const seen: string[] = [];
			for (;;) {
				const site = (await page.evaluate(
					([s, k, b, c, seen]) =>
						(window as any).__wgJoinNext(s, k, b, c, seen),
					[selector, row.kind, row.box, row.colour, seen] as const,
				)) as JoinSite | null;
				if (!site) break;
				seen.push(site.key);
				const x = Math.max(
					0,
					Math.floor(Math.min(site.before[0], site.join - 24)),
				);
				const y = Math.max(0, Math.floor(site.top - 8));
				const clip = {
					x,
					y,
					width:
						Math.min(
							width,
							Math.ceil(Math.max(site.after[1], site.join + 24)),
						) - x,
					height: Math.min(height, Math.ceil(site.bottom + 8)) - y,
					scale: 2,
				};
				const { data } = (await cdp.send("Page.captureScreenshot", {
					format: "png",
					clip,
				})) as { data: string };
				const shot = join(
					outDir,
					`${row.id}-${note.replace("/", "-")}-${seen.length}.png`,
				);
				writeFileSync(shot, Buffer.from(data, "base64"));
				const { before, after } = (await page.evaluate(
					([d, c, s]) => (window as any).__wgJoinBands(d, c, s),
					[data, clip, site] as const,
				)) as { before: Band | null; after: Band | null };
				const deltas = joinEdges[row.kind].map((edge) =>
					before && after ? after[edge] - before[edge] : Number.NaN,
				);
				const pass = deltas.every((d) => Math.abs(d) <= 0.5);
				const fmt = (b: Band | null) =>
					b ? `${b.top.toFixed(2)}..${b.bottom.toFixed(2)}` : "none";
				lines.push(
					`${pass ? "ok  " : "FAIL"} ${row.id} ${note}#${seen.length} "${site.label}": before ${fmt(before)}, after ${fmt(after)}, ${joinEdges[
						row.kind
					]
						.map((edge, i) => `${edge} ${deltas[i].toFixed(2)}`)
						.join(" ")}`,
				);
				report.push({
					id: row.id,
					note,
					label: site.label,
					pass,
					before,
					after,
					shot,
				});
			}
			if (seen.length === 0) {
				lines.push(
					`FAIL ${row.id} ${note}: no ${selector}${row.kind === "mark" ? " with a mark" : ""}`,
				);
				report.push({
					id: row.id,
					note,
					label: "",
					pass: false,
					before: null,
					after: null,
					shot: "",
				});
			}
		}
	}
	await page.keyboard.press("Escape");
	if (state.hidden) await conceal(page);
	await browser.close();
	const path = join(outDir, "joins.json");
	writeFileSync(path, JSON.stringify(report, null, 2));
	const failed = report.filter((r) => !r.pass).length;
	console.log(lines.join("\n"));
	console.log(`REPORT ${path}`);
	console.log(failed === 0 ? "JOINS ok" : `JOINS fail ${failed}`);
	if (failed > 0) process.exit(1);
}

type Outcome = {
	pass: boolean;
	reason: string;
	facts: Record<string, unknown>;
};

type EditCheck = {
	id: string;
	view: View;
	on?: Layout[];
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
		const reaches = async (pseudo: ":hover" | ":active") =>
			row.evaluate(
				(el, pseudo) =>
					new Promise<boolean>((done) => {
						const start = performance.now();
						const poll = () =>
							el.matches(pseudo)
								? done(true)
								: performance.now() - start > 2000
									? done(false)
									: setTimeout(poll, 25);
						poll();
					}),
				pseudo,
			);
		const points = [
			[-10, -10],
			[rest.labelX, rest.labelY],
			[rest.x, rest.y],
			[rest.labelX + 1, rest.labelY],
			[rest.x + 1, rest.y],
		];
		let measured: { fact: Record<string, unknown>; found: string[] } | null =
			null;
		for (let attempt = 0; attempt < 5 && !measured; attempt++) {
			await page.evaluate(() =>
				(document.activeElement as HTMLElement)?.blur(),
			);
			await page.mouse.move(-10, -10);
			await page.waitForTimeout(150);
			await page.evaluate((points) => {
				const w = window as any;
				w.__wgUnwatch?.();
				w.__wgForeign = 0;
				const own = (e: MouseEvent) =>
					points.some(
						([x, y]) =>
							Math.abs(e.clientX - x) < 3 && Math.abs(e.clientY - y) < 3,
					);
				const count = (e: Event) => {
					if (!own(e as MouseEvent)) w.__wgForeign += 1;
				};
				const types = ["mousemove", "mouseover", "mouseout"];
				for (const t of types) document.addEventListener(t, count, true);
				w.__wgUnwatch = () => {
					for (const t of types) document.removeEventListener(t, count, true);
				};
			}, points);
			await page.evaluate(async () => {
				const w = window as any;
				const start = performance.now();
				do {
					w.__wgForeign = 0;
					await new Promise((r) => setTimeout(r, 600));
				} while (w.__wgForeign > 0 && performance.now() - start < 10000);
				w.__wgForeign = 0;
			});
			const found: string[] = [];
			const hovers: Record<string, Awaited<ReturnType<typeof state>>> = {};
			for (const [part, x, y] of [
				["name", rest.labelX, rest.labelY],
				["value", rest.x, rest.y],
			] as const) {
				await page.mouse.move(x, y);
				if (!(await reaches(":hover"))) {
					await page.mouse.move(x + 1, y);
					if (!(await reaches(":hover"))) {
						found.push(
							`the window never marked ${rest.key}'s ${part} as hovered, so nothing was measured`,
						);
						continue;
					}
				}
				await page.waitForTimeout(250);
				hovers[part] = await state();
				if (!unchanged(hovers[part]))
					found.push(
						`hovering ${rest.key}'s ${part} changes the row: ${JSON.stringify(hovers[part])}`,
					);
			}
			await page.mouse.down();
			if (!(await reaches(":active")))
				found.push(
					`the window never marked ${rest.key}'s row as pressed, so the press was not measured`,
				);
			await page.waitForTimeout(150);
			const pressed = await state();
			await page.mouse.up();
			await page.mouse.move(-10, -10);
			await page.waitForTimeout(250);
			const chosen = await state();
			if (pressed.background !== rest.background)
				found.push(
					`pressing beside ${rest.key}'s value tints the row before release: ${pressed.background}`,
				);
			if (!chosen.selected)
				found.push(
					`clicking beside ${rest.key}'s value did not select the row`,
				);
			else if (chosen.ring !== rest.ring)
				found.push(`selecting ${rest.key} rings it: ${chosen.ring}`);
			else if (chosen.background === rest.background)
				found.push(
					`selecting ${rest.key} leaves its background ${rest.background}`,
				);
			const foreign = await page.evaluate(() => {
				const w = window as any;
				w.__wgUnwatch?.();
				return w.__wgForeign as number;
			});
			if (foreign === 0)
				measured = {
					fact: { ...rest, hovers, pressed, chosen, attempts: attempt + 1 },
					found,
				};
		}
		if (!measured) {
			problems.push(
				`the real pointer moved over the window in each of 5 tries on ${rest.key}, so it was not measured`,
			);
			continue;
		}
		facts.push(measured.fact);
		problems.push(...measured.found);
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
	let covered = 0;
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
			if (!point) {
				covered++;
				continue;
			}
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
				? `no ring or fill around ${clicked.map((c) => c.focused).join(", ")}${left ? `; ${left} left the DOM before their click` : ""}${covered ? `; ${covered} covered by another element` : ""}`
				: problems.join(" | "),
		facts: { clicked, left, covered },
	};
};

const tableFits = async (page: Page, table: string, column: string) => {
	const m = await page.evaluate(
		async ({ table, column }) => {
			const scroller = [
				...document.querySelectorAll<HTMLElement>(
					".workspace-leaf.mod-active .markdown-preview-view, .workspace-leaf.mod-active .cm-scroller",
				),
			].find((e) => e.checkVisibility());
			if (!scroller) return null;
			const round = (n: number) => Math.round(n * 10) / 10;
			const seen = new Map<string, Record<string, number | string>>();
			let col = 0;
			const measure = () => {
				const c = document.querySelector(column);
				if (c) col = round(c.getBoundingClientRect().width);
				if (!col) return;
				for (const t of document.querySelectorAll<HTMLElement>(table)) {
					if (!t.checkVisibility()) continue;
					const id = (t.querySelector("th")?.textContent ?? "").trim();
					if (seen.has(id)) continue;
					const sized = (width: string) => {
						const copy = t.cloneNode(true) as HTMLElement;
						copy.style.cssText = `position:absolute;visibility:hidden;max-width:none;width:${width}`;
						t.parentElement?.append(copy);
						const w = copy.getBoundingClientRect().width;
						copy.remove();
						return round(w);
					};
					let box: HTMLElement | null = t.parentElement;
					while (
						box &&
						!["auto", "scroll"].includes(getComputedStyle(box).overflowX)
					)
						box = box.parentElement;
					const pad = box
						? Number.parseFloat(getComputedStyle(box).paddingLeft) +
							Number.parseFloat(getComputedStyle(box).paddingRight)
						: 0;
					seen.set(id, {
						table: id,
						width: round(t.getBoundingClientRect().width),
						content: sized("max-content"),
						least: sized("min-content"),
						column: col,
						box: box ? round(box.clientWidth - pad) : -1,
					});
				}
			};
			for (let y = 0; ; y += scroller.clientHeight * 0.7) {
				scroller.scrollTop = y;
				await new Promise((r) => setTimeout(r, 200));
				measure();
				if (y >= scroller.scrollHeight - scroller.clientHeight) break;
			}
			await new Promise((r) => setTimeout(r, 600));
			measure();
			const first = document.querySelector<HTMLElement>(table);
			if (first)
				scroller.scrollTop +=
					first.getBoundingClientRect().top -
					scroller.getBoundingClientRect().top -
					scroller.clientHeight / 3;
			return [...seen.values()];
		},
		{ table, column },
	);
	if (!m || m.length === 0)
		return { pass: false, reason: `no ${table} in the note`, facts: {} };
	const problems: string[] = [];
	const lines = m.map((t) => {
		const width = Number(t.width);
		const content = Number(t.content);
		const least = Number(t.least);
		const column = Number(t.column);
		const box = Number(t.box);
		const expected = Math.max(Math.min(content, column), least);
		if (Math.abs(width - expected) > 1)
			problems.push(
				`"${t.table}" table ${width}px, content ${content}px, column ${column}px, expected ${expected}px`,
			);
		if (width > column + 1 && (box < 0 || box > column + 1))
			problems.push(
				`"${t.table}" is ${width}px in a ${column}px column and does not scroll in a box of its own`,
			);
		return `"${t.table}" ${width}/${column}px`;
	});
	return {
		pass: problems.length === 0,
		reason:
			problems.length === 0
				? `${m.length} tables sized to their content within the column: ${lines.join(", ")}`
				: problems.join(" | "),
		facts: { tables: m },
	};
};

const insideColumn = async (page: Page, view: View): Promise<Outcome> => {
	const m = await page.evaluate(async (view) => {
		const leaf = ".workspace-leaf.mod-active";
		const root = document.querySelector(
			view === "live"
				? `${leaf} .markdown-source-view.is-live-preview`
				: `${leaf} .markdown-reading-view`,
		);
		const column = root?.querySelector<HTMLElement>(
			view === "live" ? ".cm-sizer" : ".markdown-preview-sizer",
		);
		const scroller = root?.querySelector<HTMLElement>(
			view === "live" ? ".cm-scroller" : ".markdown-preview-view",
		);
		if (!column || !scroller) return null;
		for (const el of document.querySelectorAll("[data-column-shot]"))
			el.removeAttribute("data-column-shot");
		const clear = (c: string) => c === "transparent" || /, 0\)$/.test(c);
		const paints = (el: Element, cs: CSSStyleDeclaration) =>
			el.matches("input, img, svg, canvas, video, iframe, hr") ||
			cs.boxShadow !== "none" ||
			cs.backgroundImage !== "none" ||
			!clear(cs.backgroundColor) ||
			(["top", "right", "bottom", "left"] as const).some(
				(s) =>
					Number.parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0 &&
					!["none", "hidden"].includes(
						cs.getPropertyValue(`border-${s}-style`),
					) &&
					!clear(cs.getPropertyValue(`border-${s}-color`)),
			);
		const name = (el: Element) =>
			el.tagName.toLowerCase() +
			[...el.classList]
				.slice(0, 2)
				.map((c) => `.${c}`)
				.join("");
		const out = new Map<string, { dx: number; els: Set<Element> }>();
		const checked = new Set<Element>();
		const boxes = new Set<Element>();
		const measure = () => {
			const cs = getComputedStyle(column);
			const edge =
				column.getBoundingClientRect().left +
				Number.parseFloat(cs.borderLeftWidth) +
				Number.parseFloat(cs.paddingLeft);
			const note = (what: string, el: Element, left: number) => {
				checked.add(el);
				const dx = Math.round((left - edge) * 10) / 10;
				if (dx >= -0.5) return;
				const key = `${what} ${dx}`;
				const seen = out.get(key) ?? { dx, els: new Set<Element>() };
				out.set(key, { dx, els: seen.els.add(el) });
			};
			const walk = (el: Element, clip: number) => {
				const cs = getComputedStyle(el);
				if (cs.display === "none" || cs.visibility === "hidden") return;
				if (Number.parseFloat(cs.opacity) === 0) return;
				if (el.matches(".collapse-indicator")) return;
				const r = el.getBoundingClientRect();
				if (el.matches(".task-list-item-checkbox")) boxes.add(el);
				if (r.width > 0 && r.height > 0 && paints(el, cs))
					note(name(el), el, Math.max(r.left, clip));
				const inner =
					cs.overflowX === "visible"
						? clip
						: Math.max(clip, r.left + el.clientLeft);
				for (const n of el.childNodes) {
					if (n.nodeType === Node.ELEMENT_NODE) walk(n as Element, inner);
					else if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) {
						const range = document.createRange();
						range.selectNodeContents(n);
						for (const t of range.getClientRects())
							if (t.width > 0)
								note(`${name(el)} text`, el, Math.max(t.left, inner));
					}
				}
			};
			walk(column, Number.NEGATIVE_INFINITY);
		};
		for (let y = 0; ; y += scroller.clientHeight * 0.7) {
			scroller.scrollTop = y;
			await new Promise((r) => setTimeout(r, 200));
			measure();
			if (y >= scroller.scrollHeight - scroller.clientHeight) break;
		}
		const worst = [...out.entries()].sort((a, b) => a[1].dx - b[1].dx);
		const shot =
			worst[0]?.[1].els.values().next().value ??
			column.querySelector(".task-list-item-checkbox");
		shot?.setAttribute("data-column-shot", "");
		shot?.scrollIntoView({ block: "center" });
		return {
			checked: checked.size,
			boxes: boxes.size,
			outside: worst.map(
				([what, o]) =>
					`${what.replace(/ -?[\d.]+$/, "")} ${o.dx}px${o.els.size > 1 ? ` (x${o.els.size})` : ""}`,
			),
		};
	}, view);
	if (!m)
		return { pass: false, reason: `no note column in ${view}`, facts: {} };
	return {
		pass: m.outside.length === 0,
		reason:
			m.outside.length === 0
				? `${m.checked} painted elements, ${m.boxes} task boxes among them, start at or right of the column edge`
				: `left of the column edge: ${m.outside.join(", ")}`,
		facts: m,
	};
};

const floatingHeaderLines = async (page: Page): Promise<Outcome> => {
	const headers = await page.evaluate(() =>
		[...document.querySelectorAll(".view-header")]
			.filter(
				(el) =>
					el.checkVisibility() && getComputedStyle(el).position === "fixed",
			)
			.map((el) => {
				const lines = [null, "::before", "::after"].flatMap((pseudo) => {
					const cs = getComputedStyle(el, pseudo);
					if (pseudo && cs.content === "none") return [];
					const at = pseudo ?? "";
					const sides = (["top", "right", "bottom", "left"] as const).flatMap(
						(s) => {
							const width = Number.parseFloat(
								cs.getPropertyValue(`border-${s}-width`),
							);
							const style = cs.getPropertyValue(`border-${s}-style`);
							const color = cs.getPropertyValue(`border-${s}-color`);
							return width > 0 &&
								style !== "none" &&
								style !== "hidden" &&
								color !== "transparent" &&
								!/, 0\)$/.test(color)
								? [`${at} border-${s} ${width}px ${color}`]
								: [];
						},
					);
					return cs.boxShadow === "none"
						? sides
						: [...sides, `${at} box-shadow ${cs.boxShadow}`];
				});
				return {
					header: el.closest(".workspace-leaf.mod-active")
						? "active view header"
						: "view header",
					lines: lines.map((l) => l.trim()),
				};
			}),
	);
	if (headers.length === 0)
		return { pass: false, reason: "no floating view header", facts: {} };
	const drawn = headers.filter((h) => h.lines.length > 0);
	return {
		pass: drawn.length === 0,
		reason:
			drawn.length === 0
				? `${headers.length} floating view header(s) draw no border or shadow`
				: drawn.map((h) => `${h.header}: ${h.lines.join(", ")}`).join(" | "),
		facts: { headers },
	};
};

const toggleStep = 0.1;
const thumbContrast = 3;

const toggleStates = async (page: Page): Promise<Outcome> => {
	await installPaint(page);
	const toggles = (await page.evaluate(() => {
		const w = window as any;
		return [
			...document.querySelectorAll(
				".mod-settings .checkbox-container:not(.is-disabled)",
			),
		]
			.filter((el) => el.checkVisibility())
			.map((el) => {
				const state = (on: boolean) => {
					const copy = el.cloneNode(true) as Element;
					copy.classList.toggle("is-enabled", on);
					el.after(copy);
					const track = w.__wgGround(copy);
					const thumb = w.__wgOver(
						w.__wgParse(getComputedStyle(copy, "::after").backgroundColor),
						track,
					);
					copy.remove();
					return { track, thumb };
				};
				return { off: state(false), on: state(true) };
			});
	})) as Record<"on" | "off", { track: Rgba; thumb: Rgba }>[];
	if (toggles.length === 0)
		return {
			pass: false,
			reason: "no toggle in the settings window",
			facts: {},
		};
	const gap = (a: Rgba, b: Rgba) => Math.abs(oklchL(a) - oklchL(b));
	const measured = toggles.map((t) => ({
		on: hex(t.on.track),
		off: hex(t.off.track),
		thumb: hex(t.on.thumb),
		track: gap(t.on.track, t.off.track),
		thumbOn: contrast(t.on.thumb, t.on.track),
		thumbOff: gap(t.off.thumb, t.off.track),
	}));
	const worst = (key: "track" | "thumbOn" | "thumbOff") =>
		measured.reduce((a, b) => (b[key] < a[key] ? b : a));
	const track = worst("track");
	const thumbOn = worst("thumbOn");
	const thumbOff = worst("thumbOff");
	const problems = [
		track.track < toggleStep &&
			`track on ${track.on} and off ${track.off} differ by ${track.track.toFixed(3)} OKLCH L, below ${toggleStep}`,
		thumbOn.thumbOn < thumbContrast &&
			`thumb ${thumbOn.thumb} on the on track ${thumbOn.on} is ${thumbOn.thumbOn.toFixed(2)}:1, below ${thumbContrast}:1`,
		thumbOff.thumbOff < toggleStep &&
			`thumb on the off track ${thumbOff.off} differs by ${thumbOff.thumbOff.toFixed(3)} OKLCH L, below ${toggleStep}`,
	].filter(Boolean);
	return {
		pass: problems.length === 0,
		reason:
			problems.length === 0
				? `${measured.length} toggles: track on ${track.on} and off ${track.off} differ by ${track.track.toFixed(3)} OKLCH L, thumb ${thumbOn.thumb} is ${thumbOn.thumbOn.toFixed(2)}:1 on the on track and ${thumbOff.thumbOff.toFixed(3)} from the off track`
				: problems.join(" | "),
		facts: { measured },
	};
};

const embedHover = async (page: Page): Promise<Outcome> => {
	await installRing(page);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("DOM.enable");
	await cdp.send("CSS.enable");
	await page.evaluate(() => {
		const w = window as any;
		w.__embedAt = (pos: number) =>
			[
				...document.querySelectorAll(
					".workspace-leaf.mod-active .cm-content > .cm-embed-block",
				),
			].find(
				(el) => w.app.workspace.activeLeaf.view.editor.cm.posAtDOM(el) === pos,
			) ?? null;
	});
	const hover = async (expression: string, on: boolean) => {
		const { result } = await cdp.send("Runtime.evaluate", { expression });
		if (!result.objectId) return;
		const { nodeId } = await cdp.send("DOM.requestNode", {
			objectId: result.objectId,
		});
		await cdp.send("CSS.forcePseudoState", {
			nodeId,
			forcedPseudoClasses: on ? ["hover"] : [],
		});
	};
	const hoverAll = async (pos: number, on: boolean) => {
		await cdp.send("DOM.getDocument", { depth: 0 });
		await hover(`__embedAt(${pos})`, on);
		await hover(`__embedAt(${pos})?.querySelector(".embed-action")`, on);
	};
	const measure = (pos: number) =>
		page.evaluate(async (pos) => {
			const w = window as any;
			const el = w.__embedAt(pos) as HTMLElement | null;
			if (!el) return null;
			const r1 = (n: number) => Math.round(n * 10) / 10;
			const name = (e: Element) =>
				e.tagName.toLowerCase() +
				[...e.classList]
					.slice(0, 2)
					.map((c) => `.${c}`)
					.join("");
			const clear = (c: string) => c === "transparent" || /, 0\)$/.test(c);
			const paints = (e: Element) => {
				const s = getComputedStyle(e);
				return (
					s.backgroundImage !== "none" ||
					!clear(s.backgroundColor) ||
					(Number.parseFloat(s.borderTopWidth) > 0 &&
						s.borderTopStyle !== "none" &&
						!clear(s.borderTopColor))
				);
			};
			const frame =
				[el, ...el.querySelectorAll("*")].find(
					(e) => !e.closest(".embed-actions") && paints(e),
				) ?? el;
			const chain: Element[] = [];
			for (
				let e: Element | null = frame;
				e && e !== el.parentElement;
				e = e.parentElement
			)
				chain.push(e);
			const rings = chain
				.map((e) => [name(e), w.__ring(e) as string])
				.filter(([, ring]) => ring)
				.map(([e, ring]) => `${e} ${ring}`);
			const f = frame.getBoundingClientRect();
			const fs = getComputedStyle(frame);
			const rule =
				fs.borderTopStyle === "none" ? 0 : Number.parseFloat(fs.borderTopWidth);
			const cut =
				fs.clipPath === "none"
					? 0
					: Number.parseFloat(fs.getPropertyValue("--wg-cut")) || 0;
			const action = el.querySelector(".embed-action");
			const t = action?.getBoundingClientRect();
			const tile =
				t && t.width > 0
					? {
							top: r1(t.top - f.top),
							right: r1(f.right - t.right),
							bottom: r1(f.bottom - t.bottom),
							left: r1(t.left - f.left),
						}
					: null;
			const cm = w.app.workspace.activeLeaf.view.editor.cm;
			return {
				line: cm.state.doc.lineAt(pos).number,
				kind: [...el.classList].filter((c) => c !== "cm-embed-block").join("."),
				frame: name(frame),
				rule,
				cut,
				rings,
				tile,
			};
		}, pos);
	const seen = new Set<number>();
	const found: (NonNullable<Awaited<ReturnType<typeof measure>>> & {
		pos: number;
	})[] = [];
	const problems: string[] = [];
	const failed = new Set<number>();
	for (let y = 0; ; ) {
		const view = await page.evaluate(async (y) => {
			const w = window as any;
			const sc = document.querySelector(
				".workspace-leaf.mod-active .cm-scroller",
			) as HTMLElement;
			sc.scrollTop = y;
			await new Promise((r) => setTimeout(r, 250));
			const box = sc.getBoundingClientRect();
			const cm = w.app.workspace.activeLeaf.view.editor.cm;
			return {
				shown: [
					...document.querySelectorAll(
						".workspace-leaf.mod-active .cm-content > .cm-embed-block",
					),
				]
					.filter((el) => {
						const r = el.getBoundingClientRect();
						return r.height > 0 && r.bottom > box.top && r.top < box.bottom;
					})
					.map((el) => cm.posAtDOM(el) as number),
				next: y + sc.clientHeight * 0.7,
				end: y >= sc.scrollHeight - sc.clientHeight,
			};
		}, y);
		for (const pos of view.shown) {
			if (seen.has(pos)) continue;
			seen.add(pos);
			await page.evaluate(async (pos) => {
				(window as any).__embedAt(pos)?.scrollIntoView({ block: "center" });
				await new Promise((r) => setTimeout(r, 250));
			}, pos);
			await hoverAll(pos, true);
			await page.waitForTimeout(150);
			const m = await measure(pos);
			await hoverAll(pos, false);
			if (!m) continue;
			found.push({ ...m, pos });
			const at = `${m.kind} at line ${m.line}`;
			const wrong = m.rings.map((ring) => `hover draws ${ring}`);
			if (m.tile) {
				const { top, right, bottom, left } = m.tile;
				if (left < -0.5 || right < -0.5 || bottom < -0.5)
					wrong.push(`edit button leaves ${m.frame}`);
				if (top < m.rule - 0.5)
					wrong.push(
						`edit button top ${top}px from ${m.frame}'s top, over its ${m.rule}px top rule`,
					);
				if (m.cut > 0 && top + right < m.cut - 0.5)
					wrong.push(
						`edit button ${right}px from the right and ${top}px from the top reaches into the ${m.cut}px cut`,
					);
			}
			if (wrong.length > 0) failed.add(pos);
			for (const w of wrong) problems.push(`${at}: ${w}`);
		}
		if (view.end) break;
		y = view.next;
	}
	const shotPos = (
		found.find((m) => failed.has(m.pos)) ??
		found.find((m) => m.tile) ??
		found[0]
	)?.pos;
	if (shotPos !== undefined) {
		await page.evaluate(async (pos) => {
			for (const el of document.querySelectorAll("[data-embed-hover-shot]"))
				el.removeAttribute("data-embed-hover-shot");
			const el = (window as any).__embedAt(pos) as HTMLElement | null;
			el?.setAttribute("data-embed-hover-shot", "");
			el?.scrollIntoView({ block: "center" });
			await new Promise((r) => setTimeout(r, 250));
		}, shotPos);
		await hoverAll(shotPos, true);
	}
	const kinds = [...new Set(found.map((m) => m.kind))];
	const buttons = found.filter((m) => m.tile).length;
	if (found.length === 0)
		return {
			pass: false,
			reason: "no Live Preview embed widget in the note",
			facts: {},
		};
	return {
		pass: problems.length === 0,
		reason:
			problems.length === 0
				? `${found.length} hovered widgets (${kinds.join(", ")}) draw no ring, and ${buttons} edit buttons sit inside their frame, below its top rule and clear of its cut`
				: problems.join(" | "),
		facts: { widgets: found },
	};
};

const editChecks: EditCheck[] = [
	{
		id: "text-focus",
		view: "live",
		on: everywhere,
		open: "search",
		shot: ":focus",
		run: (page) => ringsOnClick(page, ":read-write"),
	},
	{
		id: "note-text-focus",
		view: "live",
		on: mobileOnly,
		shot: ":focus",
		run: (page) => ringsOnClick(page, ":read-write"),
	},
	{
		id: "property-select",
		view: "live",
		on: everywhere,
		shot: ".workspace-leaf.mod-active .metadata-container",
		run: selectRows,
	},
	{
		id: "raised-surfaces",
		view: "live",
		on: everywhere,
		open: "palette",
		shot: ".prompt",
		run: async (page) => {
			const found = await page.evaluate(() => {
				const probe = document.createElement("div");
				probe.style.cssText =
					"position:absolute;visibility:hidden;background:var(--wg-paper);box-shadow:var(--wg-shadow);border:1px solid var(--wg-rule)";
				document.body.append(probe);
				const want = getComputedStyle(probe);
				const expected = {
					background: want.backgroundColor,
					shadow: want.boxShadow,
					border: `${want.borderTopWidth} ${want.borderTopColor}`,
				};
				const surfaces = [
					...document.querySelectorAll(
						".prompt, .modal, .menu, .suggestion-container, .popover",
					),
				]
					.filter((el) => el.checkVisibility())
					.map((el) => {
						const cs = getComputedStyle(el);
						const round = [el, ...el.querySelectorAll("*")]
							.filter((e) => {
								const s = getComputedStyle(e);
								const drawn =
									s.borderTopStyle !== "none" ||
									!/, 0\)$|transparent/.test(s.backgroundColor);
								return (
									e.checkVisibility() &&
									drawn &&
									[
										s.borderTopLeftRadius,
										s.borderTopRightRadius,
										s.borderBottomLeftRadius,
										s.borderBottomRightRadius,
									].some((r) => Number.parseFloat(r) > 0)
								);
							})
							.map(
								(e) =>
									`${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join(".")} ${getComputedStyle(e).borderRadius}`,
							);
						return {
							el: `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")}`,
							background: cs.backgroundColor,
							shadow: cs.boxShadow,
							border: `${cs.borderTopWidth} ${cs.borderTopColor}`,
							round,
						};
					});
				probe.remove();
				return { expected, surfaces };
			});
			const problems = found.surfaces.flatMap((s) => [
				...(["background", "shadow", "border"] as const)
					.filter((k) => s[k] !== found.expected[k])
					.map((k) => `${s.el} ${k} ${s[k]}, theme ${found.expected[k]}`),
				...s.round.map((r) => `${s.el} has a rounded corner: ${r}`),
			]);
			if (found.surfaces.length === 0)
				return {
					pass: false,
					reason: "no raised surface on screen",
					facts: found,
				};
			return {
				pass: problems.length === 0,
				reason:
					problems.length === 0
						? `${found.surfaces.map((s) => s.el).join(", ")} paint the theme's paper, shadow, and rule, with square corners`
						: problems.join(" | "),
				facts: found,
			};
		},
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
		on: everywhere,
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
		on: everywhere,
		shot: ".cm-content .cm-table-widget table",
		run: (page) =>
			tableFits(
				page,
				".cm-content .cm-table-widget table",
				".cm-content > .cm-line",
			),
	},
	{
		id: "reading-column",
		view: "reading",
		on: everywhere,
		shot: "[data-column-shot]",
		run: (page) => insideColumn(page, "reading"),
	},
	{
		id: "live-column",
		view: "live",
		on: everywhere,
		shot: "[data-column-shot]",
		run: (page) => insideColumn(page, "live"),
	},
	{
		id: "floating-header",
		view: "reading",
		on: mobileOnly,
		shot: ".workspace-leaf.mod-active .view-header",
		run: floatingHeaderLines,
	},
	{
		id: "toggle-states",
		view: "reading",
		open: "settings",
		shot: ".mod-settings .checkbox-container",
		run: toggleStates,
	},
	{
		id: "code-active-line",
		view: "live",
		on: everywhere,
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
	{
		id: "embed-hover",
		view: "live",
		on: everywhere,
		shot: "[data-embed-hover-shot]",
		run: embedHover,
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
			mobile: { type: "boolean", default: false },
		},
	});
	if (!values.run) fail("editcheck needs --run <run>");
	const { layout, mobile, width, height } = screenFor(values.mobile);
	const suffix = mobile ? `${values.scheme}-mobile` : values.scheme;
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
		for (const check of editChecks.filter((c) => runsOn(c, layout))) {
			const prepared = await prepare(page, {
				width,
				height,
				mobile,
				note: values.note,
				view: check.view,
				scheme: values.scheme,
				hideRight: true,
				open: check.open ?? "none",
			});
			if ("error" in prepared) fail(prepared.error);
			const target =
				check.open === "settings" ? await settingsPage(browser, page) : page;
			if (!target) fail("settings window did not open");
			if (target !== page) {
				if (state.hidden) await conceal(page);
				await target.setViewportSize({ width, height });
			}
			await target.waitForTimeout(600);
			const outcome = await check.run(target);
			await target.waitForTimeout(200);
			const box = await target.evaluate((s) => {
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
					`editcheck-${suffix}-${check.id}.png`,
				);
				const session =
					target === page ? cdp : await target.context().newCDPSession(target);
				const { data } = await session.send("Page.captureScreenshot", {
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
			if (target !== page) await target.close();
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
	const path = join(state.runDir, `editcheck-${suffix}.json`);
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

type Fence = { language: string; line: number; source: string };

function sequenceFences(note: string): Fence[] {
	const lines = note.split("\n");
	const found: Fence[] = [];
	for (let i = 0; i < lines.length; i++) {
		const open = /^```(fasta|dna|protein)\s*$/.exec(lines[i]);
		if (!open) continue;
		const close = lines.findIndex((l, j) => j > i && /^```\s*$/.test(l));
		if (close < 0) break;
		found.push({
			language: open[1],
			line: i,
			source: lines.slice(i + 1, close).join("\n"),
		});
		i = close;
	}
	return found;
}

function fastaRecords(
	source: string,
): { header: string | null; residues: string }[] {
	const records: { header: string | null; residues: string }[] = [];
	for (const line of source.split("\n")) {
		const text = line.trim();
		if (text.startsWith(">")) records.push({ header: text, residues: "" });
		else if (text === "//" || text.startsWith("ORIGIN")) continue;
		else {
			const residues = text.replace(/[\s\d]+/g, "");
			if (residues === "") continue;
			if (records.length === 0) records.push({ header: null, residues: "" });
			records[records.length - 1].residues += residues;
		}
	}
	return records;
}

function fastaOf(source: string): string {
	return fastaRecords(source)
		.map((r) => (r.header === null ? r.residues : `${r.header}\n${r.residues}`))
		.join("\n");
}

function lengthDigits(source: string): number {
	const lengths = fastaRecords(source).map((r) => r.residues.length);
	return String(Math.max(0, ...lengths)).length;
}

function unitChars(fence: Fence): number {
	const unit = (residues: string) =>
		fence.language === "dna"
			? "nt"
			: fence.language === "protein" || /[efijlopqz*]/i.test(residues)
				? "aa"
				: "nt/aa";
	return Math.max(
		0,
		...fastaRecords(fence.source).map((r) => unit(r.residues).length),
	);
}

type Check = { pass: boolean; reason: string };

type Control = { name: string; box: Box; objectId: string };

async function elementsOf(
	cdp: CDPSession,
	expression: string,
): Promise<string[]> {
	const { result } = await cdp.send("Runtime.evaluate", { expression });
	if (!result.objectId) return [];
	const { result: props } = await cdp.send("Runtime.getProperties", {
		objectId: result.objectId,
		ownProperties: true,
	});
	return props.flatMap((p) =>
		/^\d+$/.test(p.name) && p.value?.objectId ? [p.value.objectId] : [],
	);
}

const pressEvents = ["click", "mousedown", "pointerdown", "touchstart"];

async function controlsNear(
	cdp: CDPSession,
	area: Box,
	anchor: string,
): Promise<Control[]> {
	const near = await elementsOf(
		cdp,
		`(() => {
			const a = ${JSON.stringify(area)};
			const anchor = ${anchor};
			return [...document.querySelectorAll("body *")].filter((el) => {
				if (!anchor || anchor.contains(el) || el.contains(anchor)) return false;
				const c = el.getBoundingClientRect();
				return c.width > 0 && c.height > 0 &&
					c.right > a.x - 24 && c.x < a.x + a.w + 24 &&
					c.bottom > a.y - 24 && c.y < a.y + a.h + 24;
			});
		})()`,
	);
	const controls: Control[] = [];
	for (const objectId of near) {
		const { listeners } = await cdp.send("DOMDebugger.getEventListeners", {
			objectId,
			depth: 0,
		});
		const { result } = await cdp.send("Runtime.callFunctionOn", {
			objectId,
			returnByValue: true,
			functionDeclaration: `function () {
				const r = this.getBoundingClientRect();
				const pointer = (el) => el !== null && getComputedStyle(el).cursor === "pointer";
				return {
					name: this.tagName.toLowerCase() + [...this.classList].map((k) => "." + k).join(""),
					box: { x: r.x, y: r.y, w: r.width, h: r.height },
					native: this.matches("button, a[href], input, select, textarea, summary"),
					pointer: pointer(this) && !pointer(this.parentElement),
				};
			}`,
		});
		const el = result.value as Omit<Control, "objectId"> & {
			native: boolean;
			pointer: boolean;
		};
		if (
			el.native ||
			el.pointer ||
			listeners.some((l) => pressEvents.includes(l.type))
		)
			controls.push({ name: el.name, box: el.box, objectId });
	}
	return controls;
}

async function seqcheck(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: {
			run: { type: "string" },
			note: { type: "string", default: "sequences" },
			view: { type: "string", default: "reading" },
			scheme: { type: "string", default: "light" },
			size: { type: "string", default: "1440x900" },
			mobile: { type: "boolean", default: false },
			"hide-right": { type: "boolean", default: false },
		},
	});
	if (!values.run) fail("seqcheck needs --run <run>");
	if (!["reading", "live"].includes(values.view))
		fail(`unknown --view ${values.view} (reading|live)`);
	const state = readState(values.run);
	if (!alive(state.pid))
		fail(`run "${values.run}" is not live; launch it again`);
	const [width, height] = checkShotOptions({
		...values,
		scroll: "0",
		open: "none",
	});
	const { browser, page } = await connect(state);
	const prepared = await prepare(page, {
		width,
		height,
		mobile: values.mobile,
		note: values.note,
		view: values.view,
		scheme: values.scheme,
		open: "none",
		hideRight: values["hide-right"],
	});
	if ("error" in prepared) {
		await browser.close();
		fail(prepared.error);
	}
	await page.evaluate(() => document.fonts.ready);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.waitForTimeout(500);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("DOM.enable");
	await cdp.send("CSS.enable");
	await page.evaluate(() => {
		const w = window as any;
		w.__seqFind = (view: string, line: number): HTMLElement | null => {
			const v = w.app.workspace.activeLeaf.view;
			if (view === "reading") {
				const s = v.previewMode.renderer.sections.find(
					(s: any) => s.start.line === line,
				);
				return s?.el.isConnected ? s.el.querySelector(".seq-block") : null;
			}
			const cm = v.editor.cm;
			for (const b of cm.contentDOM.querySelectorAll(".seq-block"))
				if (cm.state.doc.lineAt(cm.posAtDOM(b)).number - 1 === line) return b;
			return null;
		};
	});
	const find = (fence: Fence, scroll: boolean) =>
		page
			.waitForFunction(
				({ view, line, scroll }) => {
					const w = window as any;
					if (scroll) {
						const v = w.app.workspace.activeLeaf.view;
						if (view === "reading") v.previewMode.applyScroll(line);
						else
							v.editor.scrollIntoView(
								{ from: { line, ch: 0 }, to: { line, ch: 0 } },
								true,
							);
					}
					const block = w.__seqFind(view, line);
					if (!block) return null;
					if (scroll) block.scrollIntoView({ block: "center" });
					const r = block.getBoundingClientRect();
					return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
				},
				{ view: values.view, line: fence.line, scroll },
				{ timeout: 10000, polling: 250 },
			)
			.then((h) => h.jsonValue())
			.catch(() => null);

	const stem = `${values.view}-${values.scheme}-${values.size}${values.mobile ? "-mobile" : ""}`;
	const note = readFileSync(join(state.vault, prepared.note), "utf8");
	const fences = sequenceFences(note);
	const blocks: Record<string, unknown>[] = [];
	const badgeWidths: {
		index: number;
		digits: number;
		unit: number;
		width: number;
	}[] = [];
	for (const [index, fence] of fences.entries()) {
		const entry: Record<string, unknown> = {
			index,
			language: fence.language,
			line: fence.line + 1,
			header:
				fence.source
					.split("\n")
					.find((l) => l.trim().startsWith(">"))
					?.trim() ?? null,
		};
		blocks.push(entry);
		const checks: Record<string, Check> = {};
		entry.checks = checks;
		if (!(await find(fence, true))) {
			checks.rendered = {
				pass: false,
				reason: "no .seq-block rendered for this fence",
			};
			continue;
		}
		await page.waitForTimeout(400);
		const center = await find(fence, false);
		if (!center) {
			checks.rendered = {
				pass: false,
				reason: "block left the DOM after scrolling to it",
			};
			continue;
		}
		await cdp.send("DOM.getDocument", { depth: 0 });
		// CDP forces :hover on one node only; a real pointer hovers each ancestor too.
		const hoverChain = await elementsOf(
			cdp,
			`(() => {
				const chain = [];
				for (let e = __seqFind(${JSON.stringify(values.view)}, ${fence.line}); e; e = e.parentElement) {
					chain.push(e);
					if (e.matches(".cm-scroller, .markdown-preview-view")) break;
				}
				return chain;
			})()`,
		);
		const hovered: number[] = [];
		for (const objectId of hoverChain) {
			const { nodeId } = await cdp.send("DOM.requestNode", { objectId });
			await cdp.send("CSS.forcePseudoState", {
				nodeId,
				forcedPseudoClasses: ["hover"],
			});
			hovered.push(nodeId);
		}
		const m = await page.evaluate(
			({ view, line }) => {
				type Box = { x: number; y: number; w: number; h: number };
				const block = (window as any).__seqFind(view, line) as HTMLElement;
				const r1 = (n: number) => Math.round(n * 10) / 10;
				const box = (r: DOMRect): Box => ({
					x: r1(r.x),
					y: r1(r.y),
					w: r1(r.width),
					h: r1(r.height),
				});
				const inner = (el: Element): Box => {
					const r = el.getBoundingClientRect();
					return {
						x: r1(r.x + el.clientLeft),
						y: r1(r.y + el.clientTop),
						w: el.clientWidth,
						h: el.clientHeight,
					};
				};
				const name = (el: Element) =>
					`${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")}`;
				const rect = box(block.getBoundingClientRect());
				const scrollerEl = block.closest(
					".cm-scroller, .markdown-preview-view",
				) as HTMLElement;
				const clippedBy: { el: string; clip: Box }[] = [];
				for (let e = block.parentElement; e; e = e.parentElement) {
					const cs = getComputedStyle(e);
					const c = inner(e);
					if (
						(cs.overflowX !== "visible" || cs.overflowY !== "visible") &&
						(rect.x < c.x - 0.5 || rect.x + rect.w > c.x + c.w + 0.5)
					)
						clippedBy.push({ el: name(e), clip: c });
					if (e === scrollerEl) break;
				}
				const columnEl = block.closest(
					view === "reading" ? ".markdown-preview-sizer" : ".cm-content",
				) as HTMLElement;
				const columnStyle = getComputedStyle(columnEl);
				const columnBox = inner(columnEl);
				const column: Box = {
					...columnBox,
					x: r1(columnBox.x + parseFloat(columnStyle.paddingLeft)),
					w: r1(
						columnBox.w -
							parseFloat(columnStyle.paddingLeft) -
							parseFloat(columnStyle.paddingRight),
					),
				};
				const frameLines: string[] = [];
				for (
					let e = block.parentElement;
					e && e !== columnEl;
					e = e.parentElement
				) {
					const cs = getComputedStyle(e);
					const drawn = [
						cs.boxShadow !== "none" ? `box-shadow ${cs.boxShadow}` : "",
						cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0
							? `outline ${cs.outlineWidth}`
							: "",
						...["top", "right", "bottom", "left"].map((side) =>
							cs.getPropertyValue(`border-${side}-style`) !== "none" &&
							parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0
								? `border-${side}`
								: "",
						),
					].filter(Boolean);
					if (drawn.length > 0)
						frameLines.push(`${name(e)}: ${drawn.join(", ")}`);
				}
				const badges = [...block.querySelectorAll(".seq-record")].map((r) => {
					const badge = r.querySelector(":scope > .seq-head > .seq-badge");
					return badge ? box(badge.getBoundingClientRect()) : null;
				});
				const heads = [...block.querySelectorAll(".seq-record")].map((r) => {
					const head = r.querySelector(":scope > .seq-head");
					const badge = head?.querySelector(":scope > .seq-badge");
					if (!head || !badge) return null;
					const header = head.querySelector(":scope > .seq-header");
					const top = head.getBoundingClientRect().y;
					const row = Math.max(
						top + parseFloat(getComputedStyle(head).minHeight),
						header?.getBoundingClientRect().bottom ?? top,
					);
					return { below: r1(badge.getBoundingClientRect().y - row) };
				});
				const units = [...block.querySelectorAll(".seq-record")].map((r) => {
					const unit = r.querySelector(
						":scope > .seq-head > .seq-badge > .seq-badge-unit",
					);
					if (!unit) return null;
					const range = document.createRange();
					range.selectNodeContents(unit);
					return {
						part: r1(unit.getBoundingClientRect().width),
						text: r1(range.getBoundingClientRect().width),
					};
				});
				const headers = [...block.querySelectorAll(".seq-header")].map((h) => {
					const range = document.createRange();
					range.selectNodeContents(h);
					return {
						text: h.textContent ?? "",
						box: box(range.getBoundingClientRect()),
					};
				});
				const button = block.querySelector(".seq-copy");
				const selection = getSelection() as Selection;
				selection.removeAllRanges();
				const range = document.createRange();
				range.selectNodeContents(block);
				selection.addRange(range);
				const data = new DataTransfer();
				block.dispatchEvent(
					new ClipboardEvent("copy", {
						clipboardData: data,
						bubbles: true,
						cancelable: true,
					}),
				);
				selection.removeAllRanges();
				return {
					rect,
					column,
					badges,
					heads,
					phone: document.body.classList.contains("is-phone"),
					units,
					scroller: inner(scrollerEl),
					clippedBy,
					frameLines,
					cut: parseFloat(getComputedStyle(block).getPropertyValue("--wg-cut")),
					scrollWidth: block.scrollWidth,
					clientWidth: block.clientWidth,
					headers,
					groups: [...block.querySelectorAll(".seq-group")].map((g) =>
						box(g.getBoundingClientRect()),
					),
					records: block.querySelectorAll(".seq-record").length,
					copy: button
						? {
								box: box(button.getBoundingClientRect()),
								opacity: getComputedStyle(button).opacity,
								label: button.getAttribute("aria-label"),
							}
						: null,
					selectionText: data.getData("text/plain"),
				};
			},
			{ view: values.view, line: fence.line },
		);
		const { badges } = m;
		const meets = (a: Box, b: Box) =>
			Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 &&
			Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
		const hits = (b: Box) => [
			...m.headers
				.filter((h) => meets(b, h.box))
				.map((h) => `header "${h.text}"`),
			...m.groups.flatMap((g, i) => (meets(b, g) ? [`group ${i}`] : [])),
		];
		entry.facts = m;
		const cx = Math.max(0, m.rect.x - 8);
		const cy = Math.max(0, m.rect.y - 8);
		entry.shot = join(state.runDir, "shots", `seqcheck-${stem}-${index}.png`);
		await page.screenshot({
			path: entry.shot as string,
			clip: {
				x: cx,
				y: cy,
				width: Math.min(width, m.rect.x + m.rect.w + 8) - cx,
				height: Math.min(height, m.rect.y + m.rect.h + 8) - cy,
			},
		});
		for (const nodeId of hovered)
			await cdp.send("CSS.forcePseudoState", {
				nodeId,
				forcedPseudoClasses: [],
			});
		const span = (b: Box) => `${b.x}..${Math.round((b.x + b.w) * 10) / 10}`;
		const cut = m.clippedBy.map(
			(c) => `${c.el} (block x ${span(m.rect)}, clip x ${span(c.clip)})`,
		);
		if (m.rect.x < m.scroller.x - 0.5)
			cut.unshift(
				`scroller left edge ${m.scroller.x} (block left ${m.rect.x})`,
			);
		checks["not-clipped"] = {
			pass: cut.length === 0,
			reason:
				cut.length === 0
					? "both edges inside every clipping ancestor"
					: `cut by ${cut.join(", ")}`,
		};
		const corner: Box = {
			x: m.rect.x + m.rect.w - m.cut,
			y: m.rect.y,
			w: m.cut,
			h: m.cut,
		};
		const overCut: string[] = [];
		for (const c of await controlsNear(
			cdp,
			corner,
			`__seqFind(${JSON.stringify(values.view)}, ${fence.line})`,
		)) {
			const { nodeId } = await cdp.send("DOM.requestNode", {
				objectId: c.objectId,
			});
			await cdp.send("CSS.forcePseudoState", {
				nodeId,
				forcedPseudoClasses: ["hover"],
			});
			const { result } = await cdp.send("Runtime.callFunctionOn", {
				objectId: c.objectId,
				returnByValue: true,
				functionDeclaration: `function () {
					const r = this.getBoundingClientRect();
					const bg = getComputedStyle(this).backgroundColor;
					const alpha = bg.startsWith("rgba") ? parseFloat(bg.split(",")[3]) : 1;
					return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, alpha, bg };
				}`,
			});
			await cdp.send("CSS.forcePseudoState", {
				nodeId,
				forcedPseudoClasses: [],
			});
			const b = result.value as {
				x: number;
				y: number;
				right: number;
				bottom: number;
				alpha: number;
				bg: string;
			};
			const into = Math.min(b.right, corner.x + corner.w) - corner.x;
			const below = Math.max(b.y, corner.y) - corner.y;
			if (
				b.alpha > 0 &&
				b.x < corner.x + corner.w &&
				b.bottom > corner.y &&
				into - below > 0.5
			)
				overCut.push(`hovered ${c.name} paints ${b.bg} over the cut`);
		}
		checks["one-cut"] = {
			pass: m.frameLines.length === 0 && overCut.length === 0,
			reason:
				m.frameLines.length + overCut.length === 0
					? "no ancestor draws a line around the frame; no control paints over the cut"
					: [...m.frameLines, ...overCut].join("; "),
		};
		const fits = m.scrollWidth <= m.clientWidth + 1;
		checks.fits = {
			pass: fits,
			reason: `scrollWidth ${m.scrollWidth}, clientWidth ${m.clientWidth}`,
		};
		const left = Math.round((m.rect.x - m.column.x) * 10) / 10;
		const right =
			Math.round((m.column.x + m.column.w - m.rect.x - m.rect.w) * 10) / 10;
		checks["in-column"] = {
			pass: Math.abs(left) <= 1 && Math.abs(right) <= 1,
			reason: `block x ${span(m.rect)}, column x ${span(m.column)}`,
		};
		const badgeHits = badges.flatMap((b, i) =>
			b ? hits(b).map((h) => `badge ${i} covers ${h}`) : [],
		);
		checks["badge-clear"] = {
			pass: badgeHits.length === 0,
			reason:
				badgeHits.join("; ") ||
				`${badges.filter(Boolean).length} badge(s) clear`,
		};
		const copyHits = m.copy
			? [
					...hits(m.copy.box),
					...badges.flatMap((b, i) =>
						b && m.copy && meets(m.copy.box, b) ? [`badge ${i}`] : [],
					),
				]
			: [];
		checks["copy-clear"] = m.copy
			? {
					pass: copyHits.length === 0,
					reason:
						copyHits.length === 0
							? "button clear"
							: `button covers ${copyHits.join(", ")}`,
				}
			: { pass: false, reason: "no .seq-copy button" };
		const records = fastaRecords(fence.source).length;
		const restLabel = records > 1 ? `Copy ${records} records` : "Copy sequence";
		checks["copy-label"] = {
			pass: m.copy?.label === restLabel,
			reason: `label ${JSON.stringify(m.copy?.label ?? null)}, want ${JSON.stringify(restLabel)} for ${records} record(s)`,
		};
		const shown = badges.filter((b): b is Box => b !== null);
		const round = (n: number) => Math.round(n * 10) / 10;
		const spread = (values: number[]) =>
			round(Math.max(...values) - Math.min(...values));
		const ends = shown.map((b) => round(b.x + b.w));
		checks["badge-column"] = {
			pass:
				shown.length > 0 &&
				spread(shown.map((b) => b.w)) <= 0.5 &&
				spread(ends) <= 0.5,
			reason: `widths ${shown.map((b) => b.w).join(", ")}, right edges ${ends.join(", ")}`,
		};
		const cell = m.groups[0]?.h;
		checks["badge-height"] = {
			pass:
				cell !== undefined &&
				shown.length > 0 &&
				shown.every((b) => Math.abs(b.h - cell - 2) <= 0.5),
			reason: `heights ${shown.map((b) => b.h).join(", ")}, cell ${cell}`,
		};
		if (m.phone) {
			const below = m.heads.map((h) => h?.below ?? null);
			const offsets = below.filter((b): b is number => b !== null);
			const copyEnd = m.copy ? round(m.copy.box.x + m.copy.box.w) : null;
			checks["head-shape"] = {
				pass:
					offsets.length === shown.length &&
					offsets.length > 0 &&
					offsets.every((b) => b >= -0.5) &&
					spread(offsets) <= 0.5 &&
					copyEnd !== null &&
					ends.every((e) => Math.abs(e - copyEnd) <= 0.5),
				reason: `badge tops ${below.join(", ")}px below the first head row, right edges ${ends.join(", ")}, copy button right edge ${copyEnd}`,
			};
		}
		const units = m.units.filter(
			(u): u is { part: number; text: number } => u !== null,
		);
		const widestUnit = Math.max(...units.map((u) => u.text));
		checks["badge-unit"] = {
			pass:
				units.length > 0 &&
				units.every((u) => Math.abs(u.part - widestUnit) <= 0.5),
			reason: `unit parts ${units.map((u) => u.part).join(", ")}, widest unit text ${widestUnit}`,
		};
		if (shown[0])
			badgeWidths.push({
				index,
				digits: lengthDigits(fence.source),
				unit: unitChars(fence),
				width: shown[0].w,
			});
		const fasta = fastaOf(fence.source);
		const at = [...fasta].findIndex((c, i) => m.selectionText[i] !== c);
		const near = (t: string) =>
			JSON.stringify(t.slice(Math.max(0, at - 12), at + 24));
		checks["copy-selection"] = {
			pass: m.selectionText === fasta,
			reason:
				m.selectionText === fasta
					? "FASTA text"
					: at < 0
						? `got ${m.selectionText.length - fasta.length} extra char(s) after the FASTA text`
						: `differs at char ${at}: got ${near(m.selectionText)}, want ${near(fasta)}`,
		};
		if (!m.copy) {
			checks["copy-button"] = { pass: false, reason: "no .seq-copy button" };
			continue;
		}
		const reach = await page.evaluate(
			({ view, line, cell }) => {
				const block = (window as any).__seqFind(view, line) as HTMLElement;
				const button = block.querySelector(".seq-copy") as HTMLElement;
				const r = button.getBoundingClientRect();
				const step = 0.5;
				let x0 = Infinity;
				let y0 = Infinity;
				let x1 = -Infinity;
				let y1 = -Infinity;
				let count = 0;
				for (let x = r.x - 2 * cell; x <= r.right + 2 * cell; x += step)
					for (let y = r.y - 2 * cell; y <= r.bottom + 2 * cell; y += step) {
						if (
							document.elementFromPoint(x, y)?.closest(".seq-copy") !== button
						)
							continue;
						count += 1;
						x0 = Math.min(x0, x);
						y0 = Math.min(y0, y);
						x1 = Math.max(x1, x);
						y1 = Math.max(y1, y);
					}
				if (x0 === Infinity) return null;
				const r1 = (n: number) => Math.round(n * 10) / 10;
				const area = {
					x: r1(x0),
					y: r1(y0),
					w: r1(x1 - x0 + step),
					h: r1(y1 - y0 + step),
				};
				const pointer = (el: Element | null) =>
					el !== null && getComputedStyle(el).cursor === "pointer";
				const controls = [...document.querySelectorAll("body *")].flatMap(
					(el) => {
						if (
							el === button ||
							button.contains(el) ||
							el.contains(button) ||
							!pointer(el) ||
							pointer(el.parentElement)
						)
							return [];
						const c = el.getBoundingClientRect();
						const meets =
							Math.min(area.x + area.w, c.right) - Math.max(area.x, c.x) >
								0.5 &&
							Math.min(area.y + area.h, c.bottom) - Math.max(area.y, c.y) > 0.5;
						return meets && c.width > 0 && c.height > 0
							? [
									`${el.tagName.toLowerCase()}${[...el.classList].map((k) => `.${k}`).join("")}`,
								]
							: [];
					},
				);
				const fill = Math.round(
					(count * step * step * 100) / (area.w * area.h),
				);
				return { ...area, fill, controls };
			},
			{ view: values.view, line: fence.line, cell: cell ?? m.copy.box.h },
		);
		(entry.facts as Record<string, unknown>).copyReach = reach;
		if (reach === null) {
			checks["copy-reach"] = {
				pass: false,
				reason: "no point around the button hits it",
			};
		} else {
			const covered = [
				...hits(reach),
				...reach.controls.map((c) => `control ${c}`),
			];
			const phone = await page.evaluate(() =>
				document.body.classList.contains("is-phone"),
			);
			const want = phone && cell !== undefined ? 3 * cell : 0;
			const big =
				reach.w >= want - 1 &&
				reach.h >= want - 1 &&
				(!phone || reach.fill >= 90);
			const onBadge = badges.flatMap((b, i) =>
				b && meets(reach, b) ? [`badge ${i}`] : [],
			);
			checks["copy-reach"] = {
				pass: covered.length === 0 && big,
				reason: [
					`hit area ${reach.w}x${reach.h}, ${reach.fill}% filled, for a ${m.copy.box.w}x${m.copy.box.h} button`,
					phone ? `phone wants ${want}x${want}` : "",
					covered.length > 0 ? `covers ${covered.join(", ")}` : "",
					onBadge.length > 0 ? `meets ${onBadge.join(", ")}` : "",
				]
					.filter(Boolean)
					.join("; "),
			};
		}
		const clickCopy = async (fail: boolean) => {
			await page.evaluate(
				({ view, line, fail }) => {
					const w = window as any;
					w.__seqWrites = [];
					w.__seqLook = (b: Element | null) =>
						b
							? [
									b.getAttribute("aria-label"),
									b.classList.contains("is-copied"),
									b.innerHTML,
								].join("|")
							: null;
					w.__seqBefore = w.__seqLook(
						(w.__seqFind(view, line) as HTMLElement).querySelector(".seq-copy"),
					);
					w.__seqOwn = Object.getOwnPropertyDescriptor(
						navigator.clipboard,
						"writeText",
					);
					Object.defineProperty(navigator.clipboard, "writeText", {
						configurable: true,
						writable: true,
						value: (text: string) => {
							w.__seqWrites.push(text);
							return fail
								? Promise.reject(
										new DOMException(
											"Write permission denied.",
											"NotAllowedError",
										),
									)
								: Promise.resolve();
						},
					});
				},
				{ view: values.view, line: fence.line, fail },
			);
			let target = "";
			let after: {
				writes: string[];
				label: string | null;
				unchanged: boolean;
				notices: string[];
			};
			try {
				const b = (m.copy as { box: Box }).box;
				const at = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
				target = await page.evaluate(({ x, y }) => {
					const el = document.elementFromPoint(x, y);
					return el
						? `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`
						: "none";
				}, at);
				await page.mouse.click(at.x, at.y);
				await page.waitForTimeout(250);
			} finally {
				after = await page.evaluate(
					({ view, line }) => {
						const w = window as any;
						if (w.__seqOwn)
							Object.defineProperty(
								navigator.clipboard,
								"writeText",
								w.__seqOwn,
							);
						else delete (navigator.clipboard as any).writeText;
						const button = (
							w.__seqFind(view, line) as HTMLElement
						).querySelector(".seq-copy");
						const notices = [...document.querySelectorAll(".notice")];
						for (const n of notices) n.remove();
						return {
							writes: w.__seqWrites as string[],
							label: button?.getAttribute("aria-label") ?? null,
							unchanged: w.__seqLook(button) === w.__seqBefore,
							notices: notices.map((n) => n.textContent ?? ""),
						};
					},
					{ view: values.view, line: fence.line },
				);
			}
			return { target, ...after };
		};
		const failed = await clickCopy(true);
		const noticed =
			failed.notices.length === 1 &&
			failed.notices[0].startsWith("Could not copy");
		checks["copy-failure"] = {
			pass: failed.writes.length === 1 && noticed && failed.unchanged,
			reason:
				failed.writes.length === 0
					? `writeText not called; click hit ${failed.target}`
					: [
							noticed
								? `notice ${JSON.stringify(failed.notices[0])}`
								: `notices ${JSON.stringify(failed.notices)}`,
							failed.unchanged
								? "button unchanged"
								: `button changed, label ${JSON.stringify(failed.label)}`,
						].join("; "),
		};
		const { writes, target, label } = await clickCopy(false);
		(entry.facts as Record<string, unknown>).copyTarget = target;
		const exact = writes.length === 1 && writes[0] === fence.source;
		const told = label?.startsWith("Copied ") ?? false;
		checks["copy-button"] = {
			pass: exact && told,
			reason: !exact
				? writes.length === 0
					? `writeText not called; click hit ${target}`
					: `got ${JSON.stringify(writes[0].slice(0, 80))} (${writes.length} call(s))`
				: told
					? `writeText got the source; label "${label}"`
					: `writeText got the source but the label stayed ${JSON.stringify(label)}`,
		};
		const look = () =>
			page.evaluate(
				({ view, line }) => {
					const block = (window as any).__seqFind(view, line) as HTMLElement;
					const button = block.querySelector(".seq-copy") as HTMLElement;
					return {
						copied: button.classList.contains("is-copied"),
						opacity: getComputedStyle(button).opacity,
						label: button.getAttribute("aria-label"),
						live: [...block.querySelectorAll("[aria-live]")].map(
							(e) => e.textContent ?? "",
						),
					};
				},
				{ view: values.view, line: fence.line },
			);
		await page.mouse.move(-10, -10);
		await page.waitForTimeout(250);
		const held = await look();
		await page.waitForTimeout(1300);
		const reverted = await look();
		const heldFaults = [
			held.copied ? "" : "is-copied gone 0.5s after the click",
			held.opacity === "1"
				? ""
				: `opacity ${held.opacity} once the pointer left`,
			held.live.length === 1 && held.live[0] === held.label
				? ""
				: `live regions ${JSON.stringify(held.live)} for label ${JSON.stringify(held.label)}`,
			!reverted.copied && reverted.label === restLabel
				? ""
				: `1.8s after the click: is-copied ${reverted.copied}, label ${JSON.stringify(reverted.label)}`,
		].filter(Boolean);
		checks["copy-held"] = {
			pass: heldFaults.length === 0,
			reason:
				heldFaults.join("; ") ||
				`shown and announced as ${JSON.stringify(held.label)} after the pointer left, back to ${JSON.stringify(reverted.label)}`,
		};
	}
	await page.keyboard.press("Escape");
	await page.mouse.move(-10, -10);
	if (state.hidden) await conceal(page);
	await browser.close();

	for (const own of badgeWidths) {
		const peer = badgeWidths.find(
			(b) => b.digits === own.digits && b.unit === own.unit,
		);
		if (!peer || peer === own) continue;
		(blocks[own.index].checks as Record<string, Check>)["badge-width"] = {
			pass: Math.abs(own.width - peer.width) <= 0.5,
			reason: `${own.width}px, block ${peer.index} with ${own.digits}-digit lengths and ${own.unit}-letter units ${peer.width}px`,
		};
	}

	const failures = blocks.flatMap((b) =>
		Object.entries(b.checks as Record<string, Check>)
			.filter(([, c]) => !c.pass)
			.map(([k, c]) => `block ${b.index} ${b.language}: ${k}: ${c.reason}`),
	);
	const report = {
		run: values.run,
		note: prepared.note,
		view: values.view,
		scheme: values.scheme,
		size: values.size,
		mobile: values.mobile,
		blocks,
		failures,
	};
	const out = join(state.runDir, `seqcheck-${stem}.json`);
	writeFileSync(out, JSON.stringify(report, null, 2));
	console.log(JSON.stringify(report, null, 2));
	for (const f of failures) console.log(`FAIL ${f}`);
	console.log(`REPORT ${out}`);
	console.log(
		failures.length === 0 ? "SEQCHECK ok" : `SEQCHECK fail ${failures.length}`,
	);
	if (failures.length > 0) process.exit(1);
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
	case "joins":
		await checkJoins(rest);
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
	case "seqcheck":
		await seqcheck(rest);
		break;
	case "stop":
		stop(rest);
		break;
	default:
		fail(
			"usage: obsidian.ts <launch|doctor|shot|compare|layers|joins|editcheck|seqcheck|sync|stop> [options]",
		);
}
