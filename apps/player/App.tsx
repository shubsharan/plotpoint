import { useEffect, useRef, useState } from "react";
import { Button, Platform, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";

import {
  FOREGROUND_LOCATION_CAPABILITY,
  openRelease,
  type CanonicalJsonObject,
  type HostReleaseSupport,
} from "@plotpoint/protocol";

import { routeHostBridgeMessage } from "./src/bridge/host-bridge";
import { installReleaseFromDescriptor } from "./src/install/install-release";
import {
  createNativeInstallationPublisher,
  createNativeInstallTransport,
} from "./src/install/native-adapters";
import { captureForegroundLocation } from "./src/location/foreground-location";
import type { CandidateTransition, RunRecord } from "./src/model";
import { commitCandidateTransition } from "./src/persistence/commit-transition";
import { PlayerDatabase } from "./src/persistence/database";
import { createPlayReport } from "./src/reports/create-play-report";
import { allowRuntimeNavigation, buildRuntimeBootstrap } from "./src/runtime/bootstrap";
import { recoverLatestRun, type RecoveryBootstrap } from "./src/runtime/recovery";

const HOST_SUPPORT = Object.freeze({
  releaseFormatVersions: [1],
  hostApi: { major: 1, minor: 0 },
  aggregateSchemas: [{ id: "field.player-state.v1", kind: "player", versions: [1] }],
  capabilities: [FOREGROUND_LOCATION_CAPABILITY],
} satisfies HostReleaseSupport);

interface ActiveRuntime {
  readonly recovery: RecoveryBootstrap;
  readonly html: string;
  readonly aggregateSchemaId: string;
  readonly aggregateSchemaVersion: number;
  readonly validateAggregate: ValidateFunction;
}

function identifier(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isCandidateTransition(value: unknown): value is CandidateTransition {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.commandId === "string" &&
    typeof candidate.aggregateId === "string" &&
    candidate.aggregateKind === "player" &&
    typeof candidate.schemaId === "string" &&
    Number.isSafeInteger(candidate.schemaVersion) &&
    Number.isSafeInteger(candidate.expectedVersion) &&
    (candidate.commandOutcome === "accepted" || candidate.commandOutcome === "rejected") &&
    candidate.nextState !== null &&
    typeof candidate.nextState === "object" &&
    !Array.isArray(candidate.nextState) &&
    candidate.outcome !== null &&
    typeof candidate.outcome === "object" &&
    !Array.isArray(candidate.outcome) &&
    Array.isArray(candidate.progressionChanges) &&
    candidate.progressionChanges.every((item) => typeof item === "string") &&
    Array.isArray(candidate.observationIds) &&
    candidate.observationIds.every((item) => typeof item === "string")
  );
}

export default function App() {
  const [database, setDatabase] = useState<PlayerDatabase | null>(null);
  const [runtime, setRuntime] = useState<ActiveRuntime | null>(null);
  const [status, setStatus] = useState("Opening local player…");
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const webView = useRef<WebView>(null);

  const loadRun = async (db: PlayerDatabase, recovery: RecoveryBootstrap) => {
    const installation = await db.installedRelease(recovery.releaseId);
    if (installation === null) throw new Error("recovery-installation-missing");
    const encoded = await FileSystem.readAsStringAsync(installation.artifactUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const opened = await openRelease(base64ToBytes(encoded));
    if (opened.kind === "invalid")
      throw new Error(opened.diagnostics[0]?.code ?? "release-open-failed");
    const logicPath = opened.manifest.entrypoints.logic;
    const presentationPath = opened.manifest.entrypoints.presentation;
    const logic = opened.entries.find((entry) => entry.path === logicPath);
    const presentation = opened.entries.find((entry) => entry.path === presentationPath);
    if (logic === undefined || presentation === undefined)
      throw new Error("release-entrypoint-missing");
    const aggregateRequirement = opened.manifest.aggregateSchemas.find(
      (schema) => schema.kind === "player",
    );
    if (aggregateRequirement === undefined) throw new Error("release-player-schema-missing");
    const aggregateSchema = opened.entries.find(
      (entry) => entry.path === aggregateRequirement.path,
    );
    if (aggregateSchema === undefined) throw new Error("release-player-schema-entry-missing");
    const decoder = new TextDecoder();
    const validateAggregate = new Ajv2020({ allErrors: true, strict: true }).compile(
      JSON.parse(decoder.decode(aggregateSchema.bytes)) as object,
    );
    setRuntime({
      recovery,
      aggregateSchemaId: aggregateRequirement.id,
      aggregateSchemaVersion: aggregateRequirement.version,
      validateAggregate,
      html: buildRuntimeBootstrap({
        logicSource: decoder.decode(logic.bytes),
        presentationSource: decoder.decode(presentation.bytes),
      }),
    });
    setStatus(`Playing ${recovery.releaseId.slice(0, 20)}… offline`);
  };

  useEffect(() => {
    void PlayerDatabase.open()
      .then(async (db) => {
        setDatabase(db);
        const recovered = await recoverLatestRun(db, { recordRestore: true });
        if (recovered === null) setStatus("Scan a field-puzzle release to begin.");
        else await loadRun(db, recovered);
      })
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : "Player failed"),
      );
  }, []);

  const install = async (descriptorUrl: string) => {
    if (database === null) return;
    setScanning(false);
    setStatus("Verifying and installing release…");
    try {
      const result = await installReleaseFromDescriptor({
        descriptorUrl,
        transport: createNativeInstallTransport(),
        publisher: createNativeInstallationPublisher(database),
        support: HOST_SUPPORT,
      });
      if (result.kind === "invalid") throw new Error(result.code);
      const run: RunRecord = {
        runId: identifier("run"),
        releaseId: result.descriptor.expectedReleaseId,
        startedAt: new Date().toISOString(),
        status: "active",
      };
      await database.createRun(run);
      await loadRun(database, { ...run, aggregate: null });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Installation failed");
    }
  };

  const reply = (message: object) => {
    webView.current?.injectJavaScript(
      `window.__plotpointReceive(${JSON.stringify(JSON.stringify(message))});true;`,
    );
  };

  const onBridgeMessage = async (event: WebViewMessageEvent) => {
    if (database === null || runtime === null) return;
    const response = await routeHostBridgeMessage(event.nativeEvent.data, {
      runtimeReady: async () =>
        ({
          runId: runtime.recovery.runId,
          releaseId: runtime.recovery.releaseId,
          aggregate: runtime.recovery.aggregate,
        }) as CanonicalJsonObject,
      commitTransition: async (payload) => {
        if (!isCandidateTransition(payload.candidate))
          throw new Error("transition-candidate-invalid");
        if (
          payload.candidate.aggregateId !== "field-player" ||
          payload.candidate.schemaId !== runtime.aggregateSchemaId ||
          payload.candidate.schemaVersion !== runtime.aggregateSchemaVersion
        ) {
          throw new Error("transition-aggregate-mismatch");
        }
        if (!runtime.validateAggregate(payload.candidate.nextState)) {
          throw new Error("transition-state-schema-invalid");
        }
        const result = await commitCandidateTransition({
          store: database,
          runId: runtime.recovery.runId,
          candidate: payload.candidate,
        });
        if (result.kind === "accepted" || result.kind === "duplicate") {
          const recovered = await recoverLatestRun(database);
          if (recovered !== null) setRuntime({ ...runtime, recovery: recovered });
        }
        return result as unknown as CanonicalJsonObject;
      },
      requestCapability: async (payload) => {
        if (payload.capabilityId !== FOREGROUND_LOCATION_CAPABILITY.id) {
          throw new Error("capability-unsupported");
        }
        const observation = await captureForegroundLocation({
          database,
          runId: runtime.recovery.runId,
          startedAt: runtime.recovery.startedAt,
        });
        return {
          ...observation,
          ageMs: Date.now() - Date.parse(observation.capturedAt),
        } as unknown as CanonicalJsonObject;
      },
    });
    reply(response);
  };

  const exportReport = async () => {
    if (database === null || runtime === null || FileSystem.cacheDirectory === null) return;
    try {
      const report = await createPlayReport(
        database,
        runtime.recovery.runId,
        Platform.OS === "android" ? "android" : "ios",
      );
      const uri = `${FileSystem.cacheDirectory}plotpoint-${runtime.recovery.runId}.report.json`;
      await FileSystem.writeAsStringAsync(uri, `${JSON.stringify(report, null, 2)}\n`);
      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        dialogTitle: "Export play report",
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Report export failed");
    }
  };

  const beginScan = async () => {
    const result = permission?.granted ? permission : await requestPermission();
    if (result.granted) setScanning(true);
    else setStatus("Camera permission is required to scan an installation code.");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>PLOTPOINT · LOOP 1</Text>
          <Text style={styles.status}>{status}</Text>
        </View>
        <View style={styles.actions}>
          <Button title="Scan release" onPress={() => void beginScan()} />
          {runtime === null ? null : (
            <Button title="Export report" onPress={() => void exportReport()} />
          )}
        </View>
      </View>
      {scanning ? (
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => void install(data)}
        />
      ) : runtime === null ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Field-ready, release-free.</Text>
          <Text>Serve a verified puzzle on your private network and scan its QR code.</Text>
        </View>
      ) : (
        <WebView
          ref={webView}
          source={{ html: runtime.html, baseUrl: "about:blank" }}
          originWhitelist={["about:blank", "blob:*"]}
          onMessage={(event) => void onBridgeMessage(event)}
          onShouldStartLoadWithRequest={({ url }) => allowRuntimeNavigation(url)}
          javaScriptEnabled
          domStorageEnabled={false}
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          setSupportMultipleWindows={false}
          allowFileAccess={false}
          style={styles.webview}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f0e6" },
  header: {
    padding: 18,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#183f3920",
    backgroundColor: "#fffdf8",
  },
  eyebrow: { fontSize: 11, letterSpacing: 2, color: "#35635d", fontWeight: "700" },
  status: { marginTop: 5, color: "#183f39" },
  actions: { flexDirection: "row", gap: 12 },
  camera: { flex: 1 },
  empty: { flex: 1, justifyContent: "center", padding: 36, gap: 12 },
  emptyTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 38,
    color: "#183f39",
  },
  webview: { flex: 1, backgroundColor: "#f4f0e6" },
});
