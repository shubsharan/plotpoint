# Contract: Foreground Location Capability V1

Capability identity: `plotpoint.location.foreground`, major 1, minor 0.

A one-shot request returns either a persisted observation containing stable identity, capture time,
latitude, longitude, and horizontal accuracy, or an explicit `permission-denied`, `unavailable`, or
`failed` outcome. The host does not decide checkpoint membership. Game logic applies release-owned
coordinates, radius, maximum accuracy, and freshness rules and records the observation identity in
the command transition.
