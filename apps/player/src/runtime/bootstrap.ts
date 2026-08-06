// Production always consumes the checked-in generated runtime source. Unit tests may import
// web-runtime-kernel.ts directly; the freshness gate prevents the two paths from drifting.
export * from "./web-runtime.generated";
