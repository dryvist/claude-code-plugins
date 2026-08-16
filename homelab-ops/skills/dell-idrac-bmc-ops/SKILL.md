---
name: dell-idrac-bmc-ops
description: Bring a Dell PowerEdge BMC (iDRAC) onto the network headlessly, standardize its baseline settings, stage its firmware, and drive an unattended Proxmox/Linux install through it — including generation-specific Redfish/racadm gotchas, the identity-before-power-action rule, and the phantom-drive failure mode caused by stale firmware. Use when bringing up a new or used PowerEdge server, when a BMC won't respond, when planning any BMC power action, or when firmware looks stuck.
---

# Dell iDRAC BMC operations

Operating a Dell PowerEdge BMC (iDRAC) headlessly — no monitor, no KVM cart —
from cabling through a standardized, current-firmware baseline ready for an
unattended OS install. Every command below is copy-pasteable and generalizes
across iDRAC 6 (11G) through iDRAC 9 (14G+); where a generation can't reach a
step, that's called out rather than left to fail silently.

## The one rule that overrides everything else: identify before you act

**A BMC name or address answering is zero evidence of *which chassis* is
behind it.** BMC hostnames are commonly keyed by chassis model, not by node
role or number — nothing in a name like `idrac-r540` tells you which rack
node it fronts. A successful login proves a BMC exists and accepted your
credential; it says nothing about the hardware behind it.

Before **any** power action (reset, cycle, off), confirm the chassis serial
matches the machine you intend to touch:

```bash
ipmitool -I lanplus -H "$BMC" -U root -P "$PW" fru      # chassis/product serial
curl -sk "https://$BMC/redfish/v1/" | jq '.Oem.Dell'     # ManagerMACAddress, ServiceTag
```

If the serial doesn't match, or you can't get one, **do not issue a power
command.** This is not theoretical — guessing a BMC name from a node's role
has power-cycled the wrong live machine in this exact scenario.

## Headless bring-up

1. **Skip the front micro-USB port on macOS.** iDRAC Direct presents as an
   RNDIS network adapter; macOS ships no RNDIS driver, so the interface never
   appears at all. This isn't a cable or driver-install problem — it's a
   platform gap. Use the dedicated iDRAC RJ-45 port instead.

2. **Check whether the BMC is already reachable** before touching cables — a
   subnet sweep for hosts answering HTTPS on the management VLAN, or asking
   whatever controls that VLAN's DHCP leases which MACs are live.

3. **The zero-config fix, if it isn't reachable: move one cable.** If a
   switch port on the management VLAN already exists, plug the dedicated
   iDRAC NIC into it. iDRAC defaults to DHCP and self-configures — no port
   profile edit, no console. Give it several minutes to initialize on a cold
   box, then re-sweep.

4. **Fallbacks, cheapest first, if nothing appears:** an active VGA-to-HDMI
   adapter into any TV (fastest unblock); a serial console if BIOS
   redirection is already enabled; holding the front System ID button 16+
   seconds to reset iDRAC (does not clear a static IP).

5. **Identify the box before authenticating** — the Redfish service root is
   unauthenticated and returns the service tag and BMC MAC for free
   (`GET /redfish/v1/`, read `.Oem.Dell`). Take every MAC from this response,
   never from a chassis sticker — a label can describe the wrong interface.

6. **Try the default credential once, then read the pull-out tag.** A
   factory-reset controller doesn't reliably clear back to the well-known
   default; the real per-service-tag password is printed on the service-tag
   pull-out. iDRAC locks accounts after repeated failures — don't brute-force.

7. **Audit via Redfish before trusting anything a seller claimed** — system
   summary, CPU/memory, power, thermal, and the System Event Log. On old
   firmware (pre-4.x), `/Memory` and `/Storage` collections don't exist
   (404) — DIMM maps and per-drive health come from `racadm hwinventory` and
   `racadm storage get pdisks -o` instead. The SEL is where a used box tells
   the truth about how it was treated: recurring faults matter more than
   presence of any single event. Compare the BMC's own clock against now —
   a date sitting at an old epoch means a dead CMOS battery, not what the
   seller told you.

## Standardization baseline

Bring every BMC to one baseline so any node can be driven by the same
commands. Do this **in order** — later steps depend on earlier ones being
correct:

1. **Rotate the credential off the factory default first.** Everything else
   is pointless without it. Store the new value in your secret store
   *before* setting it — a value set and not stored is a locked-out BMC.
2. **Set identity** (hostname, domain) — a prior owner's hostname survives a
   factory erase and will show up in alerts and DHCP for years.
3. **Fix the clock before touching logs** — enable NTP and set the timezone,
   so every log entry from this point forward is stamped correctly. Do this
   before any log export/clear step, or the record becomes useless for
   correlation.
4. **Enable serial console redirection permanently** — what makes a node
   debuggable when it has no monitor and no OS.
5. **Check the power-redundancy policy** — a supply with no line input marks
   the whole chassis `Critical`, which then masks a real fault. Know which
   case you're in.
6. **Export the inherited event logs. Never clear them.** The SEL and
   Lifecycle Log are the machine's only provenance record and clearing them
   is irreversible. Treat clearing like a force-push: it needs a verified
   export first, then explicit human approval at the time — never part of
   an unattended run.

Record every BMC change in a running log as you go, not afterward — a BMC
holds state no configuration-management run will ever reconcile, so an
undocumented change here is invisible forever.

### Generation differences that bite

| Generation | Redfish | Virtual media | Notes |
| --- | --- | --- | --- |
| iDRAC 6 (11G) | none — 404 everywhere | broken | Use `ipmitool -I lanplus`, never Redfish. Falls back to Ventoy USB for install media. |
| iDRAC 9, firmware 3.x | partial (1.0.2) — no `/Memory`, no `/Storage` | NFS/CIFS only, `InsertMedia` returns 405 | Old-firmware symptoms below. |
| iDRAC 9, firmware 4.x+ | full | HTTP, NFS, CIFS, Redfish `InsertMedia` | Full HTML5 console with an Enterprise license. |

A `404`/`405` on old firmware is the generation talking, not a broken BMC —
read the allowable-values list rather than assuming a command should work:

```bash
curl -sk "${AUTH[@]}" "$R/Systems/System.Embedded.1" \
  | jq '.Actions["#ComputerSystem.Reset"]["ResetType@Redfish.AllowableValues"]'
```

### SSH to old BMC firmware needs legacy algorithms

Old BMC firmware negotiates only legacy SSH key-exchange and host-key
algorithms; modern OpenSSH refuses the handshake without an explicit opt-in,
and a loaded SSH agent makes the BMC drop the connection before it ever
prompts for a password:

```bash
RAC() {
  sshpass -e ssh -o StrictHostKeyChecking=no \
    -o KexAlgorithms=+diffie-hellman-group14-sha1 \
    -o HostKeyAlgorithms=+ssh-rsa \
    -o PubkeyAuthentication=no "root@$BMC" "$@"
}
```

## Firmware: mandatory before production use

Used gear routinely arrives years stale, and old firmware doesn't just lack
features — it can actively lie about hardware. A controller can report
**phantom drives** (physically removed disks still listed present, full
serial numbers, surviving a BMC reset and a cold power cycle) until firmware
is current. Treat a firmware update as a required onboarding step, before
any production data lands on the box.

**You cannot jump straight to current.** Dell does not support upgrading
directly from an old major to a current one — each stage is a hard
prerequisite for the next. Update in the documented staged sequence for your
model rather than trying to skip ahead.

### Firmware update gotchas — each looks like a different failure

- **Only the `WN64` package format works with `racadm update`.** The same
  version ships in multiple filenames on Dell's download page; the plain
  "Application" `.exe` is rejected with an unhelpful error. Only
  `..._WN64_<version>_A00.EXE` works.
- **The host must be powered off**, or the update job parks indefinitely
  because the OS holds the Lifecycle Controller.
- **`racadm update` is a repository command — it cannot push a bare DUP.**
  Pointed at a share with a single file and no `Catalog.xml`, it accepts the
  command, even logs progress, then fails. Use **Redfish multipart upload**
  instead — it pushes the file straight to the BMC with no share and no
  catalog:

  ```bash
  curl -sk -u "root:$PW" -X POST \
    "https://$BMC/redfish/v1/UpdateService/MultipartUpload" \
    -F 'UpdateParameters={"Targets":[],"@Redfish.OperationApplyTime":"Immediate"};type=application/json' \
    -F "UpdateFile=@/path/to/FIRMWARE.EXE;type=application/octet-stream"
  ```

- **An unfinished Lifecycle Controller first-run wizard blocks every queued
  job forever**, and powering the host off does not fix it (the trap that
  makes it look identical to the previous gotcha). It only shows on the
  console — no remote API dismisses it. Complete it once from the virtual
  console, then jobs move from `New` to `Scheduled` on their own.
- **A firmware/BIOS/RAID-config job can queue and never apply because POST
  never completes** — a storage controller reporting an unhealthy UEFI
  driver can halt POST at an interactive prompt. This is also what causes
  the phantom-drive symptom above: POST never finishing means the periodic
  hardware-inventory scan never runs. Resolution requires physical
  intervention (removing the offending drive) — nothing remote clears it.
- Dell's CDN blocks a bare `curl` user agent (403) — send a browser
  `User-Agent` and a `Referer` of `https://www.dell.com/`.

Update order once iDRAC itself is current: iDRAC/LC first (applies
everything else), then the RAID controller, then BIOS, then NICs/PSU/CPLD.
BIOS and RAID updates need a host power cycle; iDRAC resets itself
independently.

## Unattended install via BMC virtual media

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

## Related

- **proxmox-cluster-ops** (this plugin) — the cluster-membership operations
  this install target eventually joins.
- **pxe-netboot** (this plugin) — the network-boot alternative to the
  BMC-virtual-media install path above, for hardware where virtual media is
  unreliable or unlicensed.
