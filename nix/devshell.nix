{ pkgs, formatter }:
pkgs.mkShellNoCC {
  packages = [ formatter ];
}
