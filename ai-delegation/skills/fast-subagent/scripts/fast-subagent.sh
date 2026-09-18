#!/usr/bin/env bash
# fast-subagent — one bounded chat completion against the shared router's
# fast-subagent role, from any harness (Claude Code, Codex, OpenCode, Hermes…).
#
# Usage:  fast-subagent.sh [options] < prompt.txt
#   --model NAME      role alias to request (default: $FAST_SUBAGENT_MODEL, else "fast")
#   --system TEXT     system prompt (default: a small-model extraction persona)
#   --max-tokens N    completion cap (default 1024)
#   --timeout SEC     per-request wall clock (default 180)
#   --release         send the voluntary lock-release header on this call
#   --raw             print the full JSON response instead of the text
#
# Endpoint discovery, first match wins (never a provider key, never a literal host):
#   LLM_ROUTER_URL      + LLM_ROUTER_TOKEN_FILE (a file holding the bearer)  — shared router
#   OPENAI_API_BASE_URL + LITELLM_LOCAL_KEY | OPENAI_API_KEY                 — local proxy
# The router owns WHICH backend answers and the fallback order; this script
# only names the role. The answering model id is printed to stderr as
# `model=<id> fallbacks=<n>` so a caller can report which rung answered.
#
# Exit codes: 0 ok · 2 no endpoint · 3 auth refused · 4 still busy after one
# Retry-After wait · 5 request/transport failure · 6 bad usage.
set -euo pipefail

model="${FAST_SUBAGENT_MODEL:-fast}"
system='You are a fast, literal assistant. Do exactly what the instruction says. Do not explain, advise, or pad. Copy text verbatim; write UNKNOWN rather than guess.'
max_tokens=1024
timeout=180
release=0
raw=0

while [ $# -gt 0 ]; do
  case "$1" in
    --model) model="$2"; shift 2 ;;
    --system) system="$2"; shift 2 ;;
    --max-tokens) max_tokens="$2"; shift 2 ;;
    --timeout) timeout="$2"; shift 2 ;;
    --release) release=1; shift ;;
    --raw) raw=1; shift ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "fast-subagent: unknown option $1" >&2; exit 6 ;;
  esac
done

if [ -n "${LLM_ROUTER_URL:-}" ] && [ -r "${LLM_ROUTER_TOKEN_FILE:-/nonexistent}" ]; then
  base="${LLM_ROUTER_URL%/}"; key="$(cat "$LLM_ROUTER_TOKEN_FILE")"
elif [ -n "${OPENAI_API_BASE_URL:-}" ] && [ -n "${LITELLM_LOCAL_KEY:-${OPENAI_API_KEY:-}}" ]; then
  base="${OPENAI_API_BASE_URL%/}"; key="${LITELLM_LOCAL_KEY:-$OPENAI_API_KEY}"
else
  echo "fast-subagent: no router endpoint in the environment (LLM_ROUTER_URL+LLM_ROUTER_TOKEN_FILE or OPENAI_API_BASE_URL+LITELLM_LOCAL_KEY); do the step yourself and say so" >&2
  exit 2
fi
case "$base" in */v1) ;; *) base="$base/v1" ;; esac

prompt="$(cat)"
[ -n "$prompt" ] || { echo "fast-subagent: empty prompt on stdin" >&2; exit 6; }

body="$(jq -cn --arg m "$model" --arg s "$system" --arg p "$prompt" --argjson n "$max_tokens" \
  '{model:$m, max_tokens:$n, temperature:0, messages:[{role:"system",content:$s},{role:"user",content:$p}]}')"

hdr="$(mktemp)"; out="$(mktemp)"; trap 'rm -f "$hdr" "$out"' EXIT
extra=()
[ "$release" = 1 ] && extra=(-H 'x-subagent-release: 1')

call() {
  curl -sS --max-time "$timeout" -o "$out" -D "$hdr" -w '%{http_code}' \
    -H "Authorization: Bearer $key" -H 'content-type: application/json' "${extra[@]}" \
    -d "$body" "$base/chat/completions" 2>/dev/null || echo 000
}

code="$(call)"
if [ "$code" = 429 ]; then
  wait="$(awk 'tolower($1)=="retry-after:"{gsub(/\r/,"",$2);print $2}' "$hdr")"
  wait="${wait:-5}"; [ "$wait" -gt 60 ] 2>/dev/null && wait=60
  echo "fast-subagent: $model busy ($(jq -r '.error.message // .detail // "429"' "$out" 2>/dev/null | head -c 160)); retrying once in ${wait}s" >&2
  sleep "$wait"
  code="$(call)"
fi

case "$code" in
  200) ;;
  401|403) echo "fast-subagent: auth refused ($code) — key not valid for $model; do not retry with another credential" >&2; exit 3 ;;
  429) echo "fast-subagent: $model still busy after one wait — take another entry or do the step yourself, and say which" >&2; exit 4 ;;
  *) echo "fast-subagent: $model request failed (HTTP $code): $(head -c 300 "$out" 2>/dev/null)" >&2; exit 5 ;;
esac

hv() { awk -v k="$1:" 'tolower($1)==k{gsub(/\r/,"",$2);print $2}' "$hdr"; }
served="$(hv x-litellm-model-name)"; fell="$(hv x-litellm-attempted-fallbacks)"
echo "model=${served:-$(jq -r '.model // "?"' "$out")} fallbacks=${fell:-?}" >&2
if [ "$raw" = 1 ]; then cat "$out"; else jq -r '.choices[0].message.content // empty' "$out"; fi
