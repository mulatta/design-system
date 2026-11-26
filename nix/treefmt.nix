{
  projectRootFile = "flake.nix";
  settings.global.excludes = [ ".agents/**" ];
  programs = {
    # Nix
    deadnix.enable = true;
    nixfmt.enable = true;
    statix.enable = true;

    # Shell
    shellcheck.enable = true;
    shfmt.enable = true;

    # JavaScript & TypeScript
    biome.enable = true;
  };
}
