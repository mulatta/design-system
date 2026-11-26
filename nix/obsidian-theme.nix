{
  lib,
  buildNpmPackage,
  importNpmLock,
  fonts,
}:
let
  manifest = lib.importJSON ../obsidian/theme/manifest.json;
in
buildNpmPackage {
  pname = "obsidian-theme-${lib.toLower manifest.name}";
  inherit (manifest) version;

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../package.json
      ../package-lock.json
      ../DESIGN.md
      ../obsidian/theme/build.ts
      ../obsidian/theme/manifest.json
      ../obsidian/theme/src
    ];
  };

  npmDeps = importNpmLock {
    package = lib.importJSON ../package.json;
    packageLock = lib.importJSON ../package-lock.json;
  };
  inherit (importNpmLock) npmConfigHook;

  buildPhase = ''
    runHook preBuild
    node obsidian/theme/build.ts theme.body.css
    cat ${fonts}/share/design-system/fonts.css theme.body.css > theme.css
    runHook postBuild
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm run lint
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall
    install -Dm644 -t $out theme.css obsidian/theme/manifest.json
    runHook postInstall
  '';

  meta = {
    description = "Obsidian theme generated from DESIGN.md, with the design system's fonts embedded";
    platforms = lib.platforms.all;
  };
}
