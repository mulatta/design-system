{
  pkgs,
  formatter,
  impeccable,
}:
pkgs.mkShellNoCC {
  packages = [
    formatter
    impeccable
  ];
  env = {
    IMPECCABLE_BIN = pkgs.lib.getExe impeccable;
    IMPECCABLE_NO_UPDATE_CHECK = "1";
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
