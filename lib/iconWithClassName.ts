import type Ionicons from "@expo/vector-icons/Ionicons";
import { cssInterop } from "nativewind";

export function iconWithClassName(icon: typeof Ionicons) {
  cssInterop(icon, {
    className: {
      target: "style",
      nativeStyleToProp: {
        color: true,
      },
    },
  });
}
