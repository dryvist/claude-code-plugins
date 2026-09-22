# Unattended install via BMC virtual media

Reference detail for `dell-idrac-bmc-ops`. Loaded on demand.

An alternative to PXE netboot for driving an OS install with no monitor,
using the BMC's own virtual-media path instead of a network boot
infrastructure.

1. **Resolve the actual latest release, not just the newest ISO.** Vendors
   often don't cut a new installer ISO for every point release — point
   releases arrive through the package manager. "Install latest" is always
   two steps: install from the newest published ISO, then immediately
   upgrade. Verify the ISO checksum before building anything on top of it —
   an unattended install has no console to explain a corrupt image.

2. **Select target disks by serial, never by positional device name.**
   Kernel device ordering isn't stable across controllers, firmware, or
   reboots, and drives move bays. A serial-glob filter is both readable and
   safe; confirm what it actually matches before committing to it.

3. **The answer file is baked into the built ISO at build time — a later
   edit to the source file changes nothing**, and nothing warns you: a
   validator against the edited source keeps passing while the built image
   still carries the old content. If hardware changes between baking and
   booting, the install can die having found no matching target. Always
   rebuild after any answer-file change, and read the answer file back out
   of the built ISO (mount it) rather than trusting the source file's
   timestamp.

4. **Attach virtual media through the path your generation actually
   supports** (see the generation table above) — old firmware silently
   narrows this to NFS/CIFS only, or to nothing at all.

5. **Set a one-time boot override before rebooting**, so the node doesn't
   loop back into the installer on its next boot. Check the reset-type
   allowable-values list first — `ForceRestart` is absent on some firmware
   and a safe `ForceOff` then `On` works everywhere.

6. **After install, reach the true latest and detach the media** — the ISO
   only ever installs a base release; the dist-upgrade step is not
   optional.
