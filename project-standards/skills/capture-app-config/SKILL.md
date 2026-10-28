---
name: capture-app-config
description: Use when an app's Nix-managed settings need to be unlocked for UI tuning, captured into Nix, verified, and frozen again.
---

# Capture an app's Nix-managed configuration

Apply this runbook to one app at a time. Before changing state, identify the app's config path, config format, Nix module,
and normal rebuild command. Tune in the app's own settings UI. Do not hand-edit the runtime config file.

## 1. Unlock and create a follow-up

1. Inspect the module and its activation path. If it already uses an activation-merge helper, use that path to turn the
   config into a real writable file. The existing helpers are `modules/scripts/merge-json-settings.sh` and
   `modules/scripts/merge-toml-settings.sh`. They use the runtime file as the base and overlay the Nix-declared keys.
   Nix values win on conflicts.
2. If the app's config is only a Home Manager `home.file` link, add a boolean `mutableSettings` option under that
   app's `programs` namespace, defaulting to `true`. When true, use the existing activation merge. When false, restore
   the store-backed link. Do not add a script for this workflow.
3. Before activating, make sure Nix does not declare any key the operator will tune in the UI. A Nix-declared key
   overwrites the UI value at every activation.
4. Activate the unlocked module normally. Confirm the config path is a regular writable file, not a symlink, and that
   the app can save a UI change.
5. At unlock time, create a task in the **task tracker** with a due date in the future. Do not create a GitHub issue.
   Use this title:

   ```text
   <app> config: lock into Nix or keep open?
   ```

   Put this checklist in the task body. Replace the example path and option with the app's own values:

   ````markdown
   ## Current state

   A symlink target shows where the config points. A regular writable file is open for UI tuning.

   ```sh
   CONFIG_PATH="$HOME/.config/herdr/config.toml"
   if test -L "$CONFIG_PATH"; then
     readlink "$CONFIG_PATH"
   else
     test -w "$CONFIG_PATH" && echo "writable regular file" || echo "not writable"
   fi
   ```

   ## Checklist

   - [ ] Unlock with the app module's activation merge.
   - [ ] Tune settings in the app UI and let the app write its config.
   - [ ] Capture only deliberate differences into `programs.herdr.settings`.
   - [ ] Prove the sorted comparison is empty.
   - [ ] Set `programs.herdr.mutableSettings = false`, deliver the module change, rebuild from the GitHub flake ref,
         and verify the store symlink and the app's behavior.

   ## Decision

   - **Lock in:** complete capture, proof, and freeze; then close this task.
   - **Keep open:** leave `mutableSettings = true` and move the due date to a later date.
   ````

   **Herdr example:** the file is `$HOME/.config/herdr/config.toml`. Unlock with `programs.herdr.mutableSettings = true`.
   Capture `[ui.toast] delivery = "system"` as `programs.herdr.settings.ui.toast.delivery = "system"`. Freeze with
   `programs.herdr.mutableSettings = false`.

## 2. Tune in the app

Have the operator change the chosen settings in the app's own UI. The app writes the file. Keep the module unlocked
while tuning.

## 3. Capture deliberate differences

Parse each file with native Nix evaluation. Define the expression once. It reads the path from `CONFIG_PATH`:

```sh
PARSE='builtins.fromTOML (builtins.readFile (builtins.getEnv "CONFIG_PATH"))'
```

For a JSON config, use `builtins.fromJSON` instead. Save three JSON documents in `$TMPDIR`. Herdr shows the pattern:

```sh
herdr --default-config > "$TMPDIR/defaults.toml"
CONFIG_PATH="$TMPDIR/defaults.toml" nix eval --impure --json --expr "$PARSE" > "$TMPDIR/defaults.json"
CONFIG_PATH="$HOME/.config/herdr/config.toml" nix eval --impure --json --expr "$PARSE" > "$TMPDIR/disk.json"
nix eval --json '<flake-ref>#<configuration-output>.config.programs.herdr.settings' > "$TMPDIR/declared.json"
```

Use the same flake output that the normal rebuild uses for `declared.json`. For an app with no `--default-config`,
use an empty `{}` for `defaults.json` and review the whole file.

Find the deliberate choices by comparing the defaults with the file:

```sh
diff -u <(jq -S . "$TMPDIR/defaults.json") <(jq -S . "$TMPDIR/disk.json")
```

Add only deliberate UI choices to the app's `settings` attrset. Do not copy defaults or runtime-only fields into Nix.
For example, the Herdr UI setting `[ui.toast] delivery = "system"` becomes:

```nix
programs.herdr.settings.ui.toast.delivery = "system";
```

Keep secrets out of captured settings. Leave secret values in the **secret store** and keep the app's existing secret
injection path. After changing the module, run `nix fmt` in that configuration checkout.

## 4. Prove Nix alone reproduces the file

Do not use the merge helper as the proof. It keeps runtime-only keys, so a merge always reproduces the UI-written file,
whether or not Nix captured anything.

Re-create `declared.json` after the settings change, then overlay `declared.json` and `disk.json` on the defaults and
compare the sorted results. An app that writes its defaults on save then compares equal to one that does not:

```sh
diff -u \
  <(jq -S -s '.[0] * .[1]' "$TMPDIR/defaults.json" "$TMPDIR/declared.json") \
  <(jq -S -s '.[0] * .[1]' "$TMPDIR/defaults.json" "$TMPDIR/disk.json")
```

Proceed only when `diff -u` is empty and exits successfully. A difference is either a key the UI set that Nix does not
declare, or a key Nix declares that the file lacks. Correct the Nix settings or the UI choice, then repeat. Do not
freeze an unproven config: the freeze replaces the file with a read-only link, and any undeclared key is lost.

## 5. Freeze and deliver

Set the app's `mutableSettings` option to `false` so the module restores the store-backed link. Submit and merge the
module PR through the normal repo flow, update the consumer flake lock to the merged revision, and rebuild from the
GitHub flake ref. Then:

1. Confirm the config path is a symlink and `readlink` shows a Nix store target.
2. Exercise the app and confirm the captured behavior is unchanged.
3. Close the task-tracker follow-up only after both checks pass. If either fails, keep the task open and return to the
   step that failed.

## Known limits

- TOML merging round-trips through `yj`: comments are dropped and keys may be reordered.
- Secrets never go into captured settings. They stay in the secret store.
- If an app rewrites its whole config on every start, re-check the frozen symlink and the app's behavior after starting it.
