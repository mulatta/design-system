{
  lib,
  stdenvNoCC,
  fetchurl,
  python3,
  source-serif,
  d2coding,
}:
let
  maruBuri =
    weight: hash:
    fetchurl {
      url = "https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-${weight}.ttf";
      inherit hash;
    };
in
stdenvNoCC.mkDerivation {
  pname = "design-system-fonts";
  version = "0.1.0";

  dontUnpack = true;

  nativeBuildInputs = [
    (python3.withPackages (ps: [
      ps.fonttools
      ps.brotli
    ]))
  ];

  buildPhase = ''
    runHook preBuild
    python3 ${./build.py} \
      ${maruBuri "Regular" "sha256-gDQpiBknx527SUlydCROcrZyxW4FA/KCYlA/d1JMuno="} \
      ${maruBuri "Bold" "sha256-E6oQWME16PCyxB3k5eeGaxj5cKFdsrGikCJ+UtwCq6g="} \
      ${source-serif}/share/fonts/truetype \
      ${d2coding}/share/fonts/truetype/D2Coding-*-all.ttc \
      $out/share/design-system
    runHook postBuild
  '';

  dontInstall = true;

  meta = {
    description = "Subset woff2 fonts and an embedded fonts.css for the design system";
    license = lib.licenses.ofl;
    platforms = lib.platforms.all;
  };
}
