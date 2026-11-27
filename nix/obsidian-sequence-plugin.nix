{
  lib,
  buildNpmPackage,
  importNpmLock,
}:
let
  pluginDir = "obsidian/sequence-plugin";
  manifest = lib.importJSON ../obsidian/sequence-plugin/manifest.json;
in
buildNpmPackage {
  pname = "obsidian-sequence-plugin";
  inherit (manifest) version;

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../package.json
      ../package-lock.json
      ../obsidian/sequence-plugin/manifest.json
      ../obsidian/sequence-plugin/styles.css
      ../obsidian/sequence-plugin/tsconfig.json
      ../obsidian/sequence-plugin/src
    ];
  };

  npmDeps = importNpmLock {
    package = lib.importJSON ../package.json;
    packageLock = lib.importJSON ../package-lock.json;
  };
  inherit (importNpmLock) npmConfigHook;

  npmBuildScript = "plugin:build";

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm run plugin:test
    npm run plugin:check
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall
    install -Dm644 -t $out ${pluginDir}/main.js ${pluginDir}/manifest.json ${pluginDir}/styles.css
    runHook postInstall
  '';

  meta = {
    description = "Obsidian plugin that renders fasta, dna, rna, and protein code blocks";
    platforms = lib.platforms.all;
  };
}
