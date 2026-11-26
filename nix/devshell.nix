{
  pkgs,
  formatter,
  impeccable,
}:
let
  inherit (pkgs) lib playwright-driver;
  lock = lib.importJSON ../package-lock.json;
  playwrightCore = lock.packages."node_modules/playwright-core".version;
  browsers = playwright-driver.browsers.override {
    withChromium = false;
    withFirefox = false;
    withWebkit = false;
    withFfmpeg = false;
  };
  cftPlatform =
    {
      x86_64-linux = "linux64";
      aarch64-linux = "linux-arm64";
      aarch64-darwin = "mac-arm64";
    }
    .${pkgs.stdenv.hostPlatform.system};
  headlessShell = "${playwright-driver.components.chromium-headless-shell}/chrome-headless-shell-${cftPlatform}/chrome-headless-shell";
in
assert lib.assertMsg (playwrightCore == playwright-driver.version)
  "package-lock.json pins playwright-core ${playwrightCore}, nixpkgs ships playwright-driver ${playwright-driver.version}";
pkgs.mkShellNoCC {
  packages = [
    formatter
    impeccable
    pkgs.nodejs
    pkgs.obsidian
  ];
  env = {
    IMPECCABLE_BIN = lib.getExe impeccable;
    IMPECCABLE_BROWSER = headlessShell;
    IMPECCABLE_NO_UPDATE_CHECK = "1";
    PLAYWRIGHT_BROWSERS_PATH = "${browsers}";
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "1";
    DO_NOT_TRACK = "1";
  };
  shellHook = ''
    root=$PWD
    until [ -e "$root/flake.nix" ] || [ -z "$root" ]; do root=''${root%/*}; done
    if [ -n "$root" ]; then
      mkdir -p "$root/.agents/skills"
      ln -sfn ${impeccable}/share/skills/impeccable/impeccable "$root/.agents/skills/impeccable"
    fi
  '';
}
