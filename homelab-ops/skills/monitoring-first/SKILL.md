---
name: monitoring-first
description: Read system state from monitoring and close telemetry gaps.
metadata:
  version: "1.0.0"
  author: Dryvist
---

# Monitoring first

Use the monitoring stack to understand current state across hosts, guests,
containers, services, GPUs, and storage. Start with the metrics store, log
platform, and dashboards; use the source and time range that best answer the
question, and compare signals when one source cannot establish the state.

Do not open a shell to perform routine state checks. A direct shell probe is
for carrying out declared work, or a last resort when a required monitoring
signal is missing. Keep that probe narrow, record the missing signal as a
telemetry gap, and close the gap through the telemetry pipeline.

## Close telemetry gaps

When a signal is absent, incomplete, or routed to the wrong place:

1. Record which source, signal, or destination is missing and what decision it
   blocks.
2. Restore collection through native telemetry sources and pipeline packs
   first. Use an exporter or script only when the native source and pipeline
   pack cannot provide the signal.
3. Route the signal to every sink that needs it, including the metrics store,
   log platform, and dashboards where relevant.
4. Add alerts where the signal needs alerting, using both delivery paths below.
5. Verify collection and routing at each relevant sink before closing the gap.

## Alert delivery

Keep the alert paths separate:

- Send log-platform critical alerts only for actionable critical issues.
- Send push notifications to chat for every issue, critical or non-critical.

## Evidence

Support each system-state conclusion with the query or dashboard panel used.
For a query, record the source, query, and time range; for a dashboard, name
the dashboard and panel and record the selected time range. When reading logs,
follow the `log-platform` rule for the log search procedure.

For concrete endpoints, dashboards, and sink routes, consult the private
estate's **Observability stack** reference.
