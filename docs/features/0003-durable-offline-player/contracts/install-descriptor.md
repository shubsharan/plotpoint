# Contract: Install Descriptor V1

```ts
interface InstallDescriptorV1 {
  readonly version: 1;
  readonly releaseUrl: string;
  readonly expectedReleaseId: `sha256:${string}`;
}
```

Only `http:` URLs whose hostname is loopback or a private IPv4 address are eligible. Credentials,
fragments, non-default path traversal, redirects outside the eligible origin, unknown fields, and
missing expected identities are rejected. The player downloads at most 64 MiB within 30 seconds and
verifies the expected identity before compatibility assessment or publication.
