/**
 * Component Registry Initializer
 *
 * This file imports all versioned components to trigger their registration
 * with the component registry. Import this file early in your app entry
 * to ensure all components are registered before use.
 *
 * Components are organized into categories:
 * - BLOCKS: Content nodes (text, image, video, audio)
 * - GATES: Unlock nodes (choice, geolocation, password, qr, timer)
 * - OTHER: Special nodes (inventory_action, end)
 *
 * To add a new component version:
 * 1. Create the component in components/<category>/<component-name>/v<version>/
 * 2. Ensure the component calls registerComponent() at the module level
 * 3. Import the component here
 */

import { componentRegistry } from "@plotpoint/engine/registry";

// ============================================
// BLOCKS (Content Nodes)
// ============================================

// Text Block - Narrative text display
import "./blocks/text-block/v1.0.0";

// Video Block - Video playback
import "./blocks/video-block/v1.0.0";

// Image Block (Future)
// import './blocks/image-block/v1.0.0';

// Audio Block (Future)
// import './blocks/audio-block/v1.0.0';

// ============================================
// GATES (Unlock Nodes)
// ============================================

// Choice Gate - Branching decisions
import "./gates/choice-gate/v1.0.0";

// Geolocation Gate (Future)
// import './gates/geolocation-gate/v1.0.0';

// Password Gate (Future)
// import './gates/password-gate/v1.0.0';

// QR Gate (Future)
// import './gates/qr-gate/v1.0.0';

// Timer Gate (Future)
// import './gates/timer-gate/v1.0.0';

// ============================================
// OTHER (Special Nodes)
// ============================================

// Inventory Action - Item management
import "./other/inventory-action/v1.0.0";

// End Node - Story endings
import "./other/end/v1.0.0";

// ============================================
// LEGACY IMPORTS (for backward compatibility)
// ============================================
// These import the old component names and register them under both
// old and new names to support existing stories during migration.

// Text Chapter (legacy) - now text_block
import "./text-chapter/v1.0.0";

// Video Player (legacy) - now video_block
import "./video-player/v1.0.0";

// Choice Dialog (legacy) - now choice_gate
import "./choice-dialog/v1.0.0";

// Mark registry as initialized
componentRegistry.markInitialized();

// Log registered components in development
if (process.env.NODE_ENV === "development") {
  console.log("Registered components:", componentRegistry.getCategorizedSummary());
}

export { componentRegistry };
