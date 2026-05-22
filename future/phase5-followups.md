# Phase 5 Follow-Ups

Last updated: 2026-05-19

## Status

- `Phase 5 Task 5.3` is complete in the current workspace.
- `Phase 5 Task 5.4` is treated as complete by user decision.
- Manual app testing will happen outside this coding session, so no further implementation work is required for `Task 5.4`.
- The current implementation phase is considered closed unless one of the deferred follow-ups below is pulled back into active work.

## Deferred From Task 5.1

These are optional follow-up test additions, not blockers for closing the current phase.

### Rust service edge cases

- Add explicit failure-path tests for `projects.rs` update and delete behavior when rows do not exist.
- Add targeted tests for `project_skills.rs` enable/disable/remove behavior when the requested project-skill row is absent.
- Add targeted tests for `project_cli_targets.rs` remove behavior when the selected target row is already absent.
- Add more group-service edge tests around attach/disable/reenable combinations where multiple groups cover the same skill.

### Frontend orchestration coverage

- Add page-level tests for `SettingsPage` settings loading and save status transitions.
- Add page-level tests for migration success and error presentation through the composed Settings screen instead of only workflow/model coverage.

## Deferred From Task 5.2

These are optional integration-test follow-ups after the current reconcile coverage work.

### Skill lifecycle coverage

- Add a full lifecycle integration test that starts from managed snapshot install state and walks through project activation, reconcile, disable/remove, and cleanup.
- Add an integration test covering a skill reassigned from one CLI target set to another within the same project.

### Group-driven integration coverage

- Add integration coverage where a project gets skills through an attached group, then reconcile verifies the expected project-local links.
- Add an integration test for disabling a project group when one skill is still preserved by direct project assignment and another should be cleaned up.
- Add an integration test for removing a skill from a group definition and verifying downstream project reconcile behavior stays correct.

### Cross-project and multi-target extensions

- Add an integration test where two projects share multiple skills and only one project changes its selected CLI targets.
- Add an integration test for mixed direct-plus-group skill sources inside the same project after reconcile.

## Closeout Note

No further action is required for `Phase 5` unless one of the deferred `Task 5.1` or `Task 5.2` items becomes important later.
