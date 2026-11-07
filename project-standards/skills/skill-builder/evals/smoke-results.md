# Builder evaluation results

Status: **not yet run**. Updated **2026-11-06**.

| Measurement | Status |
| --- | --- |
| Actual should-trigger and should-not-trigger selection | Not yet run |
| Repeated clean-session candidate versus previous-version comparison | Not yet run |
| Native no-plugin ablation | Not yet run |
| Authoring artifacts and evidence decisions under the native harness | Not yet run |
| Independent held-out acceptance batch | Not yet run |
| Latency, token/cost deltas, and uncertainty | Not yet run |

The legacy skill-creator fixtures specify development inputs. Earlier
authoring-plan smoke observations do not supply acceptance measurements.
No trigger precision/recall, task success rate, baseline improvement, or
held-out result is asserted here.

The lead runs the exact development, previous-version, and held-out commands
in the [evaluation contract](contract.md) outside the builder sandbox. Preserve
the resulting JSON and HTML reports with the candidate and suite revisions.
Populate this record only from those measured artifacts. Structural checks
and repository CI remain separately reported source-validation evidence.
