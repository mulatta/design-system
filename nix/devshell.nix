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
}
