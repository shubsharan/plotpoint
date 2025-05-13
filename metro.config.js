const { getDefaultConfig } = require("expo/metro-config");
/** @type {import('expo/metro-config').MetroConfig} */
const { withNativeWind } = require("nativewind/metro");

const {
  wrapWithReanimatedMetroConfig,
} = require("react-native-reanimated/metro-config");

const webAliases = {
  "react-native": "react-native-web",
  "react-native-webview": "@10play/react-native-web-webview",
  "react-native/Libraries/Utilities/codegenNativeComponent":
    "@10play/react-native-web-webview/shim",
  crypto: "expo-crypto",
};

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (
  context,
  realModuleName,
  platform,
  moduleName
) => {
  if (platform === "web") {
    const alias = webAliases[realModuleName];
    if (alias) {
      return {
        filePath: require.resolve(alias),
        type: "sourceFile",
      };
    }
  }
  return context.resolveRequest(context, realModuleName, platform, moduleName);
};

config.resolver.unstable_enablePackageExports = false;

module.exports = wrapWithReanimatedMetroConfig(
  withNativeWind(config, { input: "./global.css" })
);
