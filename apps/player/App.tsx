import { useEffect, useRef, useState } from "react";
import { Button, Platform, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";

import { openRelease, type ReleaseManifest } from "@plotpoint/protocol";

import { routeHostBridgeMessage } from "./src/bridge/host-bridge";
import { installReleaseFromDescriptor } from "./src/install/install-release";
import {
  createNativeInstallationPublisher,
  createNativeInstallTransport,
} from "./src/install/native-adapters";
import { PlayerDatabase } from "./src/persistence/database";
import { createPlayReport } from "./src/reports/create-play-report";
import { createSharedHuntReport } from "./src/reports/create-shared-hunt-report";
import { allowRuntimeNavigation, buildRuntimeBootstrap } from "./src/runtime/bootstrap";
import { deriveHostSupportFromManifest } from "./src/runtime/host-support";
import { createProductionHostBridgeHandlers } from "./src/runtime/production-handlers";
import { recoverLatestRun, recoverRun, type RecoveryBootstrap } from "./src/runtime/recovery";
import { playerRunLifecycleStore, selectReleaseRun } from "./src/runtime/run-lifecycle";
import { SharedSyncStore } from "./src/shared/database";
import { routeSharedBridgeMessage } from "./src/shared/host-bridge";
import { createParticipantCredentialStore } from "./src/shared/credentials";
import { SharedSyncCoordinator } from "./src/shared/sync-coordinator";
import { SharedSessionController } from "./src/shared/session-controller";

interface ActiveRuntime {
  readonly recovery: RecoveryBootstrap;
  readonly html: string;
  readonly aggregateSchemaId: string;
  readonly aggregateSchemaVersion: number;
  readonly validateAggregate: ValidateFunction;
}

interface ReleaseDetails {
  readonly releaseIdentity: string;
  readonly releaseFormat: string;
  readonly hostApi: string;
  readonly aggregateSchemas: readonly string[];
  readonly capabilities: readonly string[];
  readonly publication: string;
}

interface InstallationFailure {
  readonly code: string;
  readonly action: string;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readArtifactBytes(uri: string): Promise<Uint8Array> {
  const encoded = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToBytes(encoded);
}

function describeRequirements(
  releaseIdentity: string,
  manifest: ReleaseManifest,
  publication: string,
): ReleaseDetails {
  return {
    releaseIdentity,
    releaseFormat: `Version ${manifest.releaseFormatVersion}`,
    hostApi: `Major ${manifest.hostApi.major}, minimum minor ${manifest.hostApi.minimumMinor}`,
    aggregateSchemas: manifest.aggregateSchemas.map(
      ({ id, kind, version }) => `${kind} · ${id} · version ${version}`,
    ),
    capabilities: manifest.capabilities.map(
      ({ id, major, minimumMinor }) => `${id} · major ${major}, minimum minor ${minimumMinor}`,
    ),
    publication,
  };
}

function installationFailure(error: unknown): InstallationFailure {
  const code = error instanceof Error ? error.message : "installation-failed";
  const normalized = code.toLowerCase();
  if (normalized.includes("url-ineligible")) {
    return {
      code,
      action: "Scan a fresh QR from a Plotpoint server on the same private network.",
    };
  }
  if (normalized.includes("redirected")) {
    return {
      code,
      action: "Serve the descriptor and release without redirects, then scan again.",
    };
  }
  if (normalized.includes("too-large")) {
    return {
      code,
      action: "Reduce the descriptor or release below the installation limit and recompile.",
    };
  }
  if (
    normalized.includes("identity") ||
    normalized.includes("digest") ||
    normalized.includes("integrity")
  ) {
    return {
      code,
      action: "Recompile and serve the exact artifact named by the descriptor, then scan again.",
    };
  }
  if (normalized.includes("incompatible") || normalized.includes("unsupported")) {
    return {
      code,
      action:
        "Use a release whose Host API, schema, and capability requirements this player supports.",
    };
  }
  if (normalized.includes("storage") || normalized.includes("publication")) {
    return {
      code,
      action: "Check available device storage, then retry the installation.",
    };
  }
  if (
    normalized.includes("http") ||
    normalized.includes("network") ||
    normalized.includes("abort")
  ) {
    return {
      code,
      action: "Keep the device and server on the same private network, restart serving, and retry.",
    };
  }
  return {
    code,
    action: "Restart the local release server and scan a newly generated QR code.",
  };
}

export default function App() {
  const [database, setDatabase] = useState<PlayerDatabase | null>(null);
  const [runtime, setRuntime] = useState<ActiveRuntime | null>(null);
  const [sharedSessionId, setSharedSessionId] = useState<string | null>(null);
  const [serviceUrl, setServiceUrl] = useState("");
  const [sessionCode, setSessionCode] = useState("");
  const [invitation, setInvitation] = useState("");
  const [status, setStatus] = useState("Opening local player…");
  const [releaseDetails, setReleaseDetails] = useState<ReleaseDetails | null>(null);
  const [installFailure, setInstallFailure] = useState<InstallationFailure | null>(null);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const webView = useRef<WebView>(null);
  const installationInFlight = useRef(false);

  const loadRun = async (
    db: PlayerDatabase,
    recovery: RecoveryBootstrap,
    publication = "Opened from a verified local publication.",
  ) => {
    const installation = await db.installedRelease(recovery.releaseId);
    if (installation === null) throw new Error("recovery-installation-missing");
    const opened = await openRelease(await readArtifactBytes(installation.artifactUri));
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
    const validateAggregate = new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(JSON.parse(decoder.decode(aggregateSchema.bytes)) as object);
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
    setSharedSessionId(await new SharedSyncStore(db.raw()).sessionForRun(recovery.runId));
    setReleaseDetails(describeRequirements(opened.releaseId, opened.manifest, publication));
    setInstallFailure(null);
    setStatus("Release ready for offline play.");
  };

  useEffect(() => {
    void PlayerDatabase.open()
      .then(async (db) => {
        setDatabase(db);
        const recovered = await recoverLatestRun(db, {
          readArtifact: readArtifactBytes,
          recordRestore: true,
        });
        if (recovered === null) setStatus("Scan a verified release to begin.");
        else await loadRun(db, recovered);
      })
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : "Player failed"),
      );
  }, []);

  const install = async (descriptorUrl: string) => {
    if (database === null || installationInFlight.current) return;
    installationInFlight.current = true;
    setScanning(false);
    setInstallFailure(null);
    setStatus("Verifying and installing release…");
    try {
      const result = await installReleaseFromDescriptor({
        descriptorUrl,
        transport: createNativeInstallTransport(),
        publisher: createNativeInstallationPublisher(database),
        support: deriveHostSupportFromManifest,
      });
      if (result.kind === "invalid") throw new Error(result.code);
      const selected = await selectReleaseRun(
        playerRunLifecycleStore(database),
        result.descriptor.expectedReleaseId,
      );
      const recovered = await recoverRun(database, selected.run, {
        readArtifact: readArtifactBytes,
      });
      if (recovered === null) throw new Error("release-run-unrecoverable");
      await loadRun(
        database,
        recovered,
        selected.kind === "created"
          ? "Published locally; fresh run created."
          : "Publication already installed; active run resumed.",
      );
    } catch (error) {
      setStatus("Installation failed.");
      setInstallFailure(installationFailure(error));
    } finally {
      installationInFlight.current = false;
    }
  };

  const reply = (message: object) => {
    webView.current?.injectJavaScript(
      `window.__plotpointReceive(${JSON.stringify(JSON.stringify(message))});true;`,
    );
  };

  const onBridgeMessage = async (event: WebViewMessageEvent) => {
    if (database === null || runtime === null) return;
    let decodedType: unknown;
    try {
      decodedType = (JSON.parse(event.nativeEvent.data) as { readonly type?: unknown }).type;
    } catch {
      decodedType = undefined;
    }
    if (typeof decodedType === "string" && decodedType.startsWith("shared.")) {
      if (sharedSessionId === null) {
        reply({
          version: 1,
          requestId: "unknown",
          type: "host.error",
          payload: { code: "shared-session-missing" },
        });
        return;
      }
      const store = new SharedSyncStore(database.raw());
      const response = await routeSharedBridgeMessage(event.nativeEvent.data, {
        getView: () => store.view(sharedSessionId),
        enqueue: (command) => store.enqueue(sharedSessionId, command, new Date().toISOString()),
      });
      reply(response);
      void new SharedSyncCoordinator(store, createParticipantCredentialStore())
        .synchronize(sharedSessionId)
        .then(() =>
          reply({
            version: 1,
            requestId: "notification",
            type: "shared.sync.changed",
            payload: {},
          }),
        )
        .catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : "Shared synchronization failed");
          reply({
            version: 1,
            requestId: "notification",
            type: "shared.sync.changed",
            payload: {},
          });
        });
      return;
    }
    const response = await routeHostBridgeMessage(
      event.nativeEvent.data,
      createProductionHostBridgeHandlers({
        store: database,
        runtime: {
          bootstrap: {
            runId: runtime.recovery.runId,
            releaseId: runtime.recovery.releaseId,
            aggregate: runtime.recovery.aggregate,
          },
          aggregateSchemaId: runtime.aggregateSchemaId,
          aggregateSchemaVersion: runtime.aggregateSchemaVersion,
          validateAggregate: runtime.validateAggregate,
        },
        location: {
          database,
          runId: runtime.recovery.runId,
          startedAt: runtime.recovery.startedAt,
        },
        onDurableResult: async () => {
          const recovered = await recoverRun(database, runtime.recovery, {
            readArtifact: readArtifactBytes,
          });
          if (recovered !== null) setRuntime({ ...runtime, recovery: recovered });
        },
      }),
    );
    reply(response);
  };

  const exportReport = async () => {
    if (database === null || runtime === null || FileSystem.cacheDirectory === null) return;
    try {
      const platform = Platform.OS === "android" ? "android" : "ios";
      const report =
        sharedSessionId === null
          ? await createPlayReport(database, runtime.recovery.runId, platform)
          : await createSharedHuntReport(database, sharedSessionId, platform);
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

  const joinSharedHunt = async () => {
    if (database === null || runtime === null) return;
    setStatus("Joining shared hunt…");
    try {
      const store = new SharedSyncStore(database.raw());
      await new SharedSessionController(store, createParticipantCredentialStore()).join({
        serviceUrl,
        sessionId: sessionCode,
        runId: runtime.recovery.runId,
        invitation,
      });
      setInvitation("");
      setSharedSessionId(sessionCode);
      setStatus("Shared hunt joined and synchronized.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Shared hunt join failed");
    }
  };

  const beginScan = async () => {
    setInstallFailure(null);
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
      {installFailure === null ? null : (
        <View style={styles.failurePanel}>
          <Text style={styles.detailLabel}>INSTALLATION DIAGNOSTIC</Text>
          <Text selectable style={styles.failureCode}>
            {installFailure.code}
          </Text>
          <Text style={styles.failureAction}>{installFailure.action}</Text>
        </View>
      )}
      {runtime !== null && sharedSessionId === null ? (
        <View style={styles.joinPanel}>
          <Text style={styles.detailLabel}>JOIN COOPERATIVE HUNT</Text>
          <TextInput
            value={serviceUrl}
            onChangeText={setServiceUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://service.example"
            style={styles.input}
          />
          <TextInput
            value={sessionCode}
            onChangeText={setSessionCode}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Session ID"
            style={styles.input}
          />
          <TextInput
            value={invitation}
            onChangeText={setInvitation}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="One-use invitation"
            style={styles.input}
          />
          <Button
            title="Join hunt"
            disabled={
              serviceUrl.length === 0 || sessionCode.length === 0 || invitation.length === 0
            }
            onPress={() => void joinSharedHunt()}
          />
        </View>
      ) : null}
      {releaseDetails === null ? null : (
        <View style={styles.releasePanel}>
          <Text style={styles.detailLabel}>VERIFIED LOCAL RELEASE</Text>
          <Text style={styles.publication}>{releaseDetails.publication}</Text>
          <Text style={styles.requirementLabel}>Release identity</Text>
          <Text selectable style={styles.releaseIdentity}>
            {releaseDetails.releaseIdentity}
          </Text>
          <View style={styles.requirementGrid}>
            <View style={styles.requirementCell}>
              <Text style={styles.requirementLabel}>Release format</Text>
              <Text style={styles.requirementValue}>{releaseDetails.releaseFormat}</Text>
            </View>
            <View style={styles.requirementCell}>
              <Text style={styles.requirementLabel}>Host API</Text>
              <Text style={styles.requirementValue}>{releaseDetails.hostApi}</Text>
            </View>
          </View>
          <Text style={styles.requirementLabel}>Aggregate schemas</Text>
          <Text style={styles.requirementValue}>
            {releaseDetails.aggregateSchemas.join("\n") || "None"}
          </Text>
          <Text style={styles.requirementLabel}>Capabilities</Text>
          <Text style={styles.requirementValue}>
            {releaseDetails.capabilities.join("\n") || "None"}
          </Text>
        </View>
      )}
      {scanning ? (
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => void install(data)}
        />
      ) : runtime === null ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Player ready, release-free.</Text>
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
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    color: "#35635d",
    fontWeight: "700",
  },
  status: { marginTop: 5, color: "#183f39" },
  actions: { flexDirection: "row", gap: 12 },
  detailLabel: {
    color: "#35635d",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  failurePanel: {
    backgroundColor: "#fff1e8",
    borderBottomColor: "#a34b2a40",
    borderBottomWidth: 1,
    gap: 5,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  joinPanel: {
    gap: 8,
    padding: 14,
    backgroundColor: "#e8f1ed",
    borderBottomWidth: 1,
    borderBottomColor: "#183f3920",
  },
  input: {
    backgroundColor: "#fffdf8",
    borderWidth: 1,
    borderColor: "#35635d55",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#183f39",
  },
  failureCode: { color: "#7b2f18", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  failureAction: { color: "#542619" },
  releasePanel: {
    backgroundColor: "#e8f1ed",
    borderBottomColor: "#183f3920",
    borderBottomWidth: 1,
    gap: 5,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  publication: { color: "#183f39", fontWeight: "600" },
  releaseIdentity: {
    color: "#183f39",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
  },
  requirementGrid: { flexDirection: "row", gap: 24, marginTop: 4 },
  requirementCell: { flex: 1 },
  requirementLabel: { color: "#52716d", fontSize: 11, marginTop: 4 },
  requirementValue: { color: "#183f39", fontSize: 12 },
  camera: { flex: 1 },
  empty: { flex: 1, justifyContent: "center", padding: 36, gap: 12 },
  emptyTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 38,
    color: "#183f39",
  },
  webview: { flex: 1, backgroundColor: "#f4f0e6" },
});
