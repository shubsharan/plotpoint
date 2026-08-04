# Contract: Install Descriptor V1

```ts
interface InstallDescriptorV1 {
  readonly version: 1;
  readonly releaseUrl: string;
  readonly expectedReleaseId: `sha256:${string}`;
}
```

## Descriptor Fetch

- The scanned descriptor URL is absolute `http:` and uses a loopback or private IPv4 host.
- User information, credentials, fragments, redirects, and unknown descriptor fields are rejected.
- The descriptor body is at most 64 KiB and contains one UTF-8 JSON object.
- `expectedReleaseId` is exactly `sha256:` followed by 64 lowercase hexadecimal characters.

## Release Fetch

- `releaseUrl` is absolute `http:`, uses the same origin as the scanned descriptor URL, and contains no
  credentials or fragment.
- All redirects are rejected; the final URL must exactly equal `releaseUrl`.
- The release body is at most 64 MiB, enforced while streaming rather than only from `Content-Length`.
- The combined descriptor-and-release network phase has a 30-second deadline.

The player verifies the complete artifact against `expectedReleaseId` and assesses release-format,
host-API, aggregate-schema, and capability compatibility before executing code or publishing files.
Any failure leaves no durable candidate record and cannot alter a published installation.
