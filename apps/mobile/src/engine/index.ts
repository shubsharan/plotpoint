// Registry
export {
  componentRegistry,
  registerComponent,
  resolveVersion,
  resolveManifest,
  resolveWithDependencies,
  getResolvedComponent,
  validateManifest,
  createDefaultManifest,
  type FallbackStrategy,
} from "./registry";

// Runtime components are now in app/(player)/_components/
// Import directly from there if needed:
// - StoryRunner from "app/(player)/_components/story-runner"
// - NodeRenderer from "app/(player)/_components/node-renderer"
