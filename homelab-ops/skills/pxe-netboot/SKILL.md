---
name: pxe-netboot
description: Reliable remote OS install over PXE when a server's virtual-media/remote-KVM path is broken or unreliable — proxyDHCP + TFTP via dnsmasq, kernel/initrd served over plain HTTP, and a custom-built iPXE binary with an embedded autoexec script (because a distro-packaged one won't auto-chainload). Use when a legacy BMC's virtual CD is unreliable, USB-boot keeps falling through to an unwanted existing OS, or any headless install needs a from-scratch netboot path.
---

# PXE netboot install (legacy/unreliable remote-media hardware)

When a server's out-of-band virtual-media path (iDRAC/iLO/BMC virtual CD) is
broken or unreliable, and USB-boot keeps falling through to whatever OS is
already on the internal disks, PXE is the install path that actually works.
This is the concrete recipe — a temporary netboot service run from an
existing healthy hypervisor on the same network.

## When to use this

- The BMC's virtual-media/remote-KVM path is unreliable on this generation of
  hardware.
- The target's internal disks already carry an OS that keeps re-booting after
  every USB-boot override the firmware silently drops (a known failure mode
  on some legacy BMC firmware: a "boot from USB next" flag that should
  persist behaves as one-shot).
- Any older chassis being added to the fleet later, once you have this
  recipe built once.

## When NOT to use this

- Routine reinstall of an already-healthy node — a verified bootable USB
  stick is simpler.
- First install on brand-new hardware with guaranteed-blank disks — USB-boot
  is simpler there too; reach for PXE only once the simple path has actually
  failed.

## Topology

```text
Existing healthy host (same network segment as the target)
  ├── dnsmasq proxyDHCP + TFTP on that interface
  │     → supplements the existing DHCP server with PXE-boot options only,
  │       doesn't replace it
  ├── a plain HTTP server serving kernel + initrd + an answer/config file
  └── a custom-built iPXE binary with an embedded autoexec script

Target chassis
  ├── BMC on its own management network — IPMI-over-LAN reachable
  └── Primary NIC on the same segment as the netboot host — PXE-capable BIOS
```

## Steps (per node)

### 1. Stage kernel + initrd

Build (or reuse) an auto-install image with a per-node unattended-answer
file baked in, then extract just the kernel and initrd from it — you don't
need to serve the whole ISO, only the two boot artifacts plus the answer
file:

```bash
mkdir -p /mnt/iso /srv/http/<target>
mount -o loop /path/to/auto-install.iso /mnt/iso
cp /mnt/iso/boot/<kernel> /mnt/iso/boot/<initrd> /srv/http/<target>/
cp <answer-file> /srv/http/<target>/answer.toml
umount /mnt/iso
```

Total per-node footprint is small — tens of megabytes, not the full ISO.

### 2. Stand up the HTTP server

```bash
nohup setsid python3 -m http.server 8080 \
  --bind <netboot-host-ip> --directory /srv/http \
  </dev/null >/var/log/pxe-http.log 2>&1 &
```

A plain `http.server` is fine for a one-shot install; use nginx/caddy if this
becomes a standing service. Expect noisy `BrokenPipeError` log lines from
iPXE's range requests it later cancels — that's normal, not a fault.

### 3. Stand up dnsmasq as proxyDHCP + TFTP

```bash
systemd-run --unit=pxe-dnsmasq --description="PXE dnsmasq" \
  /usr/sbin/dnsmasq --keep-in-foreground \
  --bind-interfaces --interface=<netboot-iface> --except-interface=lo \
  --no-resolv --no-hosts --port=0 \
  --enable-tftp --tftp-root=/srv/tftp \
  --dhcp-no-override --dhcp-range=<subnet-cidr>,proxy \
  --dhcp-userclass=set:ipxe,iPXE \
  --pxe-service=x86PC,"iPXE chain",undionly.kpxe \
  --dhcp-boot=tag:ipxe,http://<netboot-host-ip>:8080/boot.ipxe \
  --log-dhcp --log-queries --log-facility=/var/log/dnsmasq-pxe.log
```

Use `systemd-run --unit=...` rather than a backgrounded `nohup` — an
SSH-detached `nohup &` process gets reaped when the session ends; a transient
systemd unit survives detachment.

### 4. Build iPXE with an embedded autoexec script

The distro-packaged `undionly.kpxe` binary does **not** auto-execute the
DHCP-offered chain URL by default. Iterating on the dnsmasq config won't fix
this — embed the boot script directly into the iPXE binary instead:

```sh
#!ipxe
dhcp || sleep 3 || dhcp || shell
iseq ${mac} <target-mac> && goto target || goto default
:target
kernel http://<netboot-host-ip>:8080/<target>/<kernel> <kernel-args>
initrd http://<netboot-host-ip>:8080/<target>/<initrd>
boot || shell
```

```bash
git clone --depth 1 https://github.com/ipxe/ipxe.git /tmp/ipxe-src
cd /tmp/ipxe-src/src
make -j4 bin/undionly.kpxe EMBED=/path/to/embed.ipxe
cp bin/undionly.kpxe /srv/tftp/undionly.kpxe
```

### 5. Trigger the install

```bash
ipmitool -I lanplus -H <bmc-ip> -U <bmc-user> -P <bmc-password> \
  chassis bootdev pxe options=persistent
ipmitool -I lanplus -H <bmc-ip> -U <bmc-user> -P <bmc-password> \
  chassis power cycle
```

Typical timing: BIOS POST + PXE init ~90s; TFTP load of the small iPXE
binary under 1s; iPXE's HTTP fetch of kernel+initrd ~10-30s; the actual
installer running ~15-30 min depending on disk/package count.

## Verification

```bash
ssh <netboot-host> 'tail -f /var/log/dnsmasq-pxe.log /var/log/pxe-http.log'
nc -zv -w 2 <target-ip> 22        # once the installer reboots into the new OS
ssh <target-ip> 'hostname'
```

## Rollback

If the installer fails partway through:

```bash
ipmitool -I lanplus -H <bmc-ip> -U <bmc-user> -P <bmc-password> \
  chassis bootdev none options=persistent
ipmitool -I lanplus -H <bmc-ip> -U <bmc-user> -P <bmc-password> \
  chassis power off
```

The disks are either freshly formatted (install reached the partition step)
or still hold whatever was there before (install died earlier) — both are
recoverable states; leave the host powered off for inspection rather than
retrying blind.

## Related

- **infrastructure-standards** (infra-standards) — where a newly-installed
  node's identity and IP/VLAN placement should be declared once it's up.
