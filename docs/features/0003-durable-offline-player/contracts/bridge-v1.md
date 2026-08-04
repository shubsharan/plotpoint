# Contract: Host Bridge V1

Every envelope is a closed canonical object with `version: 1`, a non-empty stable `requestId`, a
known `type`, and a type-specific `payload`.

WebView to host types:

- `runtime.ready`
- `transition.commit`
- `capability.request`

Host to WebView types:

- `runtime.bootstrap`
- `transition.result`
- `capability.result`
- `host.error`

`transition.commit` carries the command identity, target aggregate, expected version, canonical
execution result, and consumed observation identities. The host returns acceptance only after the
atomic transaction commits. Unknown versions, types, fields, or malformed payloads produce
`host.error` and never change durable state.
