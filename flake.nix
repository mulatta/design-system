{
  description = "Design system: tokens, fonts, and themes built from them";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";
    treefmt-nix.url = "github:numtide/treefmt-nix";
  };

  outputs =
    {
      self,
      nixpkgs,
      treefmt-nix,
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      inherit (nixpkgs) lib;

      eachSystem = lib.genAttrs systems;

      pkgsFor = eachSystem (
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfreePredicate = pkg: lib.getName pkg == "obsidian";
        }
      );

      treefmtEval = eachSystem (
        system: treefmt-nix.lib.evalModule pkgsFor.${system} (import ./nix/treefmt.nix)
      );

      formatter = eachSystem (system: treefmtEval.${system}.config.build.wrapper);

      devShells = eachSystem (system: {
        default = import ./nix/devshell.nix {
          pkgs = pkgsFor.${system};
          formatter = formatter.${system};
          impeccable = self.packages.${system}.impeccable;
        };
      });
    in
    {
      inherit devShells formatter;

      packages = eachSystem (system: {
        impeccable = pkgsFor.${system}.callPackage ./nix/impeccable.nix { };
      });

      checks = eachSystem (system: {
        devshell-default = devShells.${system}.default;
        impeccable = self.packages.${system}.impeccable;
        formatting = treefmtEval.${system}.config.build.check self;
      });
    };
}
