{
  lib,
  stdenv,
  rustPlatform,
  fetchFromGitHub,
  installAgentSkills,
  git,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "impeccable";
  version = "0.1.30";

  src = fetchFromGitHub {
    owner = "pbakaus";
    repo = "impeccable";
    tag = "engine-v${finalAttrs.version}";
    hash = "sha256-Q4A0VHMqZt6XxAFYzaZDxm0VOW+3ZgYQmbGTmiXBhvw=";
  };

  cargoHash = "sha256-/x7a0PUDdNfHiiPappzomk+rsaG8f8KLKhKWYplUyro=";

  __structuredAttrs = true;
  strictDeps = true;

  nativeBuildInputs = [ installAgentSkills ];

  # The tree holds generated copies of the skill for other harnesses under the same name.
  dontInstallAgentSkills = true;

  postInstall = ''
    installSkill plugin/skills/impeccable
  '';

  cargoBuildFlags = [
    "-p"
    "impeccable"
  ];
  cargoTestFlags = [
    "-p"
    "impeccable"
  ];

  nativeCheckInputs = [ git ];

  checkFlags = [
    # Spawning /bin/ps fails with EPERM in the darwin Nix build.
    "--skip=loop_install::tests::mac::install_update_and_current_with_no_open"
    "--skip=loop_install::tests::mac::a_blocked_loop_is_reinstalled_and_one_still_blocked_says_so"
    "--skip=loop_install::tests::mac::update_quits_a_running_loop_then_swaps"
    "--skip=loop_install::tests::mac::a_loop_that_does_not_quit_keeps_the_refusal_and_the_old_app"
    "--skip=loop_install::tests::mac::quitting_touches_only_this_bundle"
    # These lease and grace assertions fail inside the Nix build on aarch64-darwin and pass outside it.
    "--skip=agent_target_answers_the_resolution_verdict_when_no_page_can_serve"
    "--skip=agent_target_late_overlay_first_no_match_extends_the_grace"
    "--skip=agent_target_reconnect_keeps_the_overlays_lease_and_word"
    "--skip=agent_target_refuses_a_generate_event_from_a_page_that_never_held_the_lease"
    "--skip=agent_target_refuses_a_generate_event_from_a_superseded_claimant"
    # Needs a Chromium-based browser, which the build does not have.
    "--skip=captures_code_and_png_with_real_pixels_and_rejects_missing_inputs_without_replacing_review"
    "--skip=motion_clipped"
    "--skip=motion_crossfade_dip"
    "--skip=motion_crossfade_overexposure"
    "--skip=motion_entrance_replay"
    "--skip=motion_grid_gap"
    "--skip=motion_late_hover"
    "--skip=motion_orphan_linger"
    "--skip=motion_paint_order_swap"
    "--skip=motion_playback_rate"
    "--skip=motion_playback_reverse"
    "--skip=motion_pseudo_twins"
    "--skip=motion_setup_reaches_the_open_state_before_an_exit"
    "--skip=motion_shadow_toggle"
    "--skip=motion_sibling"
    "--skip=motion_smooth"
    "--skip=motion_swap"
    "--skip=motion_web_component"
  ];

  preCheck = lib.optionalString stdenv.hostPlatform.isLinux ''
    # The hook treats any path under /build, the Linux sandbox's TMPDIR, as generated.
    export TMPDIR=$(mktemp -d /tmp/impeccable-check.XXXXXX)
  '';

  nativeInstallCheckInputs = [ versionCheckHook ];
  doInstallCheck = true;

  passthru.updateScript = nix-update-script {
    extraArgs = [
      "--version-regex"
      "engine-v(.*)"
    ];
  };

  meta = {
    description = "Impeccable design skill and the engine its launcher runs";
    homepage = "https://impeccable.style";
    changelog = "https://github.com/pbakaus/impeccable/releases/tag/engine-v${finalAttrs.version}";
    license = lib.licenses.asl20;
    mainProgram = "impeccable";
  };
})
