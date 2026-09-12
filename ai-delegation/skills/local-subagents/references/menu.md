# Menu recipes

Extra `jq` over the `/model/info` response saved as `menu.json` in step 3 of
`local-subagents`. Nothing here names a model; every recipe selects from what
the router actually returns.

## Aliases only (roles, not physical ids)

A role alias is short and has no vendor prefix or slash. Physical ids carry
one. This is a heuristic over the returned names, not a promise about them:

```sh
jq -r '.data[].model_name | select(test("^[a-z0-9-]+$"))' menu.json | sort
```

## Free entries that fit an input of N tokens

```sh
N=40000
jq -r --argjson n "$N" '.data[]
  | select((.model_info.input_cost_per_token // 0) == 0)
  | select((.model_info.max_input_tokens // 0) > $n)
  | [.model_name, (.model_info.hints.speed // "?"),
     ((.model_info.hints.best_for // []) | join("/"))] | @tsv' menu.json
```

## Entries good at one kind of work

```sh
WANT=summarize
jq -r --arg w "$WANT" '.data[]
  | select((.model_info.hints.best_for // []) | index($w))
  | [.model_name, (.model_info.hints.quality // "?"),
     (.model_info.hints.speed // "?"),
     ((.model_info.hints.caveats // []) | join(","))] | @tsv' menu.json
```

## What an alias resolves to right now

Useful when a result looks wrong and you need to know which model produced it:

```sh
jq -r '.data[] | select(.model_name == "'"$ALIAS"'")
  | {name: .model_name, backend: .litellm_params.model,
     ctx: .model_info.max_input_tokens, hints: .model_info.hints}' menu.json
```

## Price of a call you already made

Multiply the response's `usage` by the entry's per-token prices. Both numbers
come from the same source, so no price is ever written down here:

```sh
jq -r --slurpfile m menu.json '
  ($m[0].data[] | select(.model_name == input_filename) | .model_info) as $i
  | .usage | (.prompt_tokens * ($i.input_cost_per_token // 0))
           + (.completion_tokens * ($i.output_cost_per_token // 0))' response.json
```

## Sanity checks before trusting the menu

- An entry with `max_input_tokens: null` advertises no window. Treat it as
  unknown and send a small input, not as unlimited.
- `enabled` state is not in this response — a name that is listed can still
  fail at call time if its backend is down. A `400`/`404` on a listed name
  means re-fetch, not retry.
- Hints are declarations, not live measurements. A `measured` block carries
  its own date; if it is old, treat the speed class as directional.
