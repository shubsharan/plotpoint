import { registerSheet, SheetDefinition } from "react-native-actions-sheet";
import ProfileSettingsSheet from "./profileSettingsSheet";

registerSheet("profile-settings", ProfileSettingsSheet);

// We extend some of the types here to give us great intellisense
// across the app for all registered sheets.
declare module "react-native-actions-sheet" {
  interface Sheets {
    "profile-settings": SheetDefinition;
  }
}

export {};
