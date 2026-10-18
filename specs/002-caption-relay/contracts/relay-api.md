# Relay API Contract

Both routes:

- exist only when `CAPTION_RELAY_SECRET` is configured; otherwise `404` (indistinguishable from any
  unknown route);
- require `Authorization: Bearer <secret>`; a missing or wrong secret returns `401`
  `{"error":{"code":"UNAUTHORIZED",...}}`; more than 10 failures per minute from one client returns
  `429`;
- run on the Node runtime, `Cache-Control: no-store`.

## GET /api/relay/next

Long poll for the next caption job.

- **Query**: none. The app holds the request for up to 25 s.
- **200**: a job was leased to this caller.

  ```json
  { "jobId": "3f8e2c1a-…", "videoId": "jNQXAC9IVRw" }
  ```

- **204**: no job within 25 s. The relay polls again immediately.
- Every authenticated call updates relay presence.

## POST /api/relay/result

- **Body** (≤ 2 MB): `RelayResult` ([data-model.md](../data-model.md#relayresult-relay--app)).
- **204**: accepted; waiting viewer requests resolve.
- **400** `INVALID_REQUEST`: body fails the schema or is too large.
- **404** `RELAY_JOB_NOT_FOUND`: unknown, expired, or already completed job id.

## GET /api/health (changed)

When the relay is enabled, the body gains a `relay` field:

```json
{ "status": "ok", "version": "abc1234", "relay": { "online": true, "lastSeenSeconds": 3 } }
```

`lastSeenSeconds` is `null` before the first poll. Without the secret configured the field is absent.

## Provider chain (internal)

`direct` → `relay` (only when online; else fails fast as `BLOCKED`) → `supadata` (if configured) →
paste fallback (`YOUTUBE_BLOCKED`). Relay result kinds map as for any provider: `NO_CAPTIONS` and
`UNAVAILABLE` are definitive; `BLOCKED` and `TRANSIENT` move on.
