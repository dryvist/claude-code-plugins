// A recorded instant-query response from the metrics store for the three agent_quota_* series, kept verbatim.
export const RECORDED_QUOTA = `
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      { "metric": { "__name__": "agent_quota_used_percent", "executor": "codex", "window": "five_hour", "source": "provider" }, "value": [1762826280.412, "42.5"] },
      { "metric": { "__name__": "agent_quota_window_seconds", "executor": "codex", "window": "five_hour", "source": "provider" }, "value": [1762826280.412, "18000"] },
      { "metric": { "__name__": "agent_quota_reset_timestamp_seconds", "executor": "codex", "window": "five_hour", "source": "provider" }, "value": [1762826280.412, "1762833600"] },
      { "metric": { "__name__": "agent_quota_used_percent", "executor": "codex", "window": "weekly", "source": "provider" }, "value": [1762826280.412, "31"] },
      { "metric": { "__name__": "agent_quota_window_seconds", "executor": "codex", "window": "weekly", "source": "provider" }, "value": [1762826280.412, "604800"] },
      { "metric": { "__name__": "agent_quota_reset_timestamp_seconds", "executor": "codex", "window": "weekly", "source": "provider" }, "value": [1762826280.412, "1763085600"] },
      { "metric": { "__name__": "agent_quota_used_percent", "executor": "cursor", "window": "monthly", "source": "estimate" }, "value": [1762826310.007, "12"] },
      { "metric": { "__name__": "agent_quota_window_seconds", "executor": "cursor", "window": "monthly", "source": "estimate" }, "value": [1762826310.007, "2592000"] },
      { "metric": { "__name__": "agent_quota_reset_timestamp_seconds", "executor": "cursor", "window": "monthly", "source": "estimate" }, "value": [1762826310.007, "1764122400"] }
    ]
  }
}
`
