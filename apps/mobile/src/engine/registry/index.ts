export { componentRegistry, registerComponent } from './component-registry';
export {
  resolveVersion,
  resolveManifest,
  resolveWithDependencies,
  getResolvedComponent,
  validateManifest,
  createDefaultManifest,
  type FallbackStrategy,
} from './version-resolver';
