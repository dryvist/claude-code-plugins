# Tracker API traps

Verified API behavior for the incident and task trackers.

## Zammad

- Ticket search returns at most 100 results regardless of `limit`; query one
  state at a time.
- Fetching `/tickets/{id}?expand=true` omits article bodies. Use
  `/ticket_articles/by_ticket/{id}` to retrieve them.
- A human-facing ticket number is not the ticket ID. Search for `number:<n>` to
  resolve the ID before updating.
- Update a ticket with `PUT /tickets/{id}`, passing `state_id` and an `article`
  object with `type: note`, `internal: true`, `subject`, and `body`.

| `state_id` | State |
| --- | --- |
| `1` | new |
| `2` | open |
| `3` | pending reminder |
| `4` | closed |
| `5` | merged |
| `6` | pending close |

## Vikunja

- Task creation uses `PUT`, not `POST`.
