import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AppState,
  Button,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  inspectGameRelease,
  openRelease,
  type CanonicalJsonObject,
  type CanonicalJsonValue,
  type GameComposition,
  type ProgressionInstance,
  type ReleaseManifest,
  type SharedPlayView,
} from "@plotpoint/protocol";

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
import {
  recoverLatestRun,
  recoverRun,
  verifyRecoveryArtifact,
  type RecoveryBootstrap,
} from "./src/runtime/recovery";
import { playerRunLifecycleStore, selectReleaseRun } from "./src/runtime/run-lifecycle";
import { SharedSyncStore } from "./src/shared/database";
import {
  createCompositionSharedBridgeHandlers,
  deriveSharedRuntimeSurface,
  type SharedProjectionContract,
  routeSharedBridgeMessage,
  type SharedRuntimeSurface,
} from "./src/shared/host-bridge";
import { createParticipantCredentialStore } from "./src/shared/credentials";
import { SharedSyncCoordinator } from "./src/shared/sync-coordinator";
import { SharedSessionController } from "./src/shared/session-controller";

type ActiveRecovery = RecoveryBootstrap & {
  readonly aggregate: NonNullable<RecoveryBootstrap["aggregate"]>;
};

interface ActiveRuntime {
  readonly recovery: ActiveRecovery;
  readonly html: string;
  readonly composition: GameComposition;
  readonly aggregateSchemaVersions: Readonly<Record<string, number>>;
  readonly projectionContract: SharedProjectionContract | null;
  readonly sharedSurface: SharedRuntimeSurface;
  readonly aggregateSchemaId: string;
  validateSchema(schemaId: string, value: CanonicalJsonObject): boolean;
  validateProgression(progressionId: string, value: ProgressionInstance): boolean;
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

function bytesToBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function assetMediaType(path: string): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  switch (extension) {
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "mp4":
      return "video/mp4";
    default:
      return "application/octet-stream";
  }
}

function canonicalValue(value: unknown): value is CanonicalJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
  if (Array.isArray(value)) return value.every(canonicalValue);
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(value).every(canonicalValue)
  );
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
  const sharedSyncCoordinator = useRef<SharedSyncCoordinator | null>(null);
  const sharedSessionController = useRef<SharedSessionController | null>(null);

  const loadRun = async (
    db: PlayerDatabase,
    recovery: RecoveryBootstrap,
    publication = "Opened from a verified local publication.",
  ) => {
    if (recovery.aggregate === null) throw new Error("runtime-aggregate-missing");
    const activeRecovery: ActiveRecovery = { ...recovery, aggregate: recovery.aggregate };
    const installation = await db.installedRelease(recovery.releaseId);
    if (installation === null) throw new Error("recovery-installation-missing");
    const artifactBytes = await readArtifactBytes(installation.artifactUri);
    const verifiedArtifact = await verifyRecoveryArtifact({
      bytes: artifactBytes,
      expectedReleaseId: recovery.releaseId,
      manifestJson: installation.manifestJson,
    });
    if (verifiedArtifact.kind === "invalid") throw new Error(verifiedArtifact.code);
    const [opened, inspection] = await Promise.all([
      openRelease(artifactBytes),
      inspectGameRelease(artifactBytes),
    ]);
    if (opened.kind === "invalid")
      throw new Error(opened.diagnostics[0]?.code ?? "release-open-failed");
    if ("kind" in inspection)
      throw new Error(inspection.diagnostics[0]?.code ?? "game-composition-invalid");
    if (inspection.release.releaseId !== opened.releaseId) {
      throw new Error("game-composition-release-mismatch");
    }
    const composition = inspection.gameComposition;
    const logicPath = opened.manifest.entrypoints.logic;
    const presentationPath = opened.manifest.entrypoints.presentation;
    const logic = opened.entries.find((entry) => entry.path === logicPath);
    const presentation = opened.entries.find((entry) => entry.path === presentationPath);
    if (logic === undefined || presentation === undefined)
      throw new Error("release-entrypoint-missing");
    const localModel = composition.aggregateModels.find(
      (model) => model.authority === "local" && model.id === recovery.aggregate?.modelId,
    );
    if (localModel?.authority !== "local") throw new Error("release-player-model-missing");
    const aggregateRequirement = opened.manifest.aggregateSchemas.find(
      (schema) => schema.kind === "player" && schema.id === localModel.stateSchema.id,
    );
    if (aggregateRequirement === undefined) throw new Error("release-player-schema-missing");
    const aggregateSchema = opened.entries.find(
      (entry) => entry.path === aggregateRequirement.path,
    );
    if (aggregateSchema === undefined) throw new Error("release-player-schema-entry-missing");
    const decoder = new TextDecoder();
    if (!verifiedArtifact.validateSchema(aggregateRequirement.id, activeRecovery.aggregate.state)) {
      throw new Error("runtime-aggregate-schema-invalid");
    }
    const content: Record<string, CanonicalJsonValue> = Object.create(null);
    const assets: Record<string, CanonicalJsonValue> = Object.create(null);
    for (const resource of composition.resources) {
      if (resource.role !== "content" && resource.role !== "asset") continue;
      const entry = opened.entries.find(({ path }) => path === resource.path);
      if (entry === undefined) throw new Error(`runtime-resource-entry-missing:${resource.id}`);
      if (resource.role === "content") {
        const value: unknown = JSON.parse(decoder.decode(entry.bytes));
        if (!canonicalValue(value)) throw new Error(`runtime-content-invalid:${resource.id}`);
        content[resource.id] = value;
      } else {
        const mediaType = assetMediaType(resource.path);
        assets[resource.id] = {
          uri: `data:${mediaType};base64,${bytesToBase64(entry.bytes)}`,
          mediaType,
        };
      }
    }
    const aggregateSchemaVersions = Object.freeze(
      Object.fromEntries(opened.manifest.aggregateSchemas.map(({ id, version }) => [id, version])),
    );
    let projectionContract: SharedProjectionContract | null = null;
    if (composition.trustedMechanic !== undefined) {
      const serverModel = composition.aggregateModels.find(
        ({ id }) => id === composition.trustedMechanic?.aggregateModel,
      );
      if (serverModel?.authority !== "server") throw new Error("release-server-model-missing");
      const serverSchema = opened.manifest.aggregateSchemas.find(
        ({ id, kind }) => id === serverModel.stateSchema.id && kind === serverModel.kind,
      );
      const projectionResource = composition.resources.find(
        ({ id, role }) =>
          id === composition.trustedMechanic?.projectionSchema.id && role === "schema",
      );
      const projectionEntry = opened.entries.find(({ path }) => path === projectionResource?.path);
      if (
        serverSchema === undefined ||
        projectionResource === undefined ||
        projectionEntry === undefined
      ) {
        throw new Error("release-projection-schema-missing");
      }
      const validateProjection = new Ajv2020({ allErrors: true, strict: true }).compile(
        JSON.parse(decoder.decode(projectionEntry.bytes)) as object,
      );
      projectionContract = Object.freeze({
        schemaId: composition.trustedMechanic.projectionSchema.id,
        schemaVersion: serverSchema.version,
        validate: (value: SharedPlayView["projections"][number]["value"]) =>
          validateProjection(value),
      });
    }
    let sessionId: string | null = null;
    let sharedView: SharedPlayView | null = null;
    if (composition.trustedMechanic !== undefined) {
      const sharedStore = new SharedSyncStore(db.raw());
      sessionId = await sharedStore.sessionForRun(recovery.runId);
      if (sessionId !== null) sharedView = await sharedStore.view(sessionId);
    }
    const sharedSurface = deriveSharedRuntimeSurface(
      composition,
      sharedView,
      activeRecovery.releaseId,
      projectionContract,
    );
    setRuntime({
      recovery: activeRecovery,
      composition,
      aggregateSchemaVersions,
      projectionContract,
      sharedSurface,
      aggregateSchemaId: aggregateRequirement.id,
      validateSchema: verifiedArtifact.validateSchema,
      validateProgression: verifiedArtifact.validateProgression,
      html: buildRuntimeBootstrap({
        logicSource: decoder.decode(logic.bytes),
        presentationSource: decoder.decode(presentation.bytes),
        gameComposition: composition,
        content,
        assets,
        aggregateSchemaVersions,
        sharedBindingAvailable: sharedSurface.sharedBindingAvailable,
      }),
    });
    setSharedSessionId(sessionId);
    setReleaseDetails(describeRequirements(opened.releaseId, opened.manifest, publication));
    setInstallFailure(null);
    if (sharedSurface.kind === "join") setStatus("Release ready to join shared play.");
    else if (sharedSurface.kind === "bound") setStatus("Shared play ready.");
    else if (sharedSurface.kind === "recovery") setStatus(sharedSurface.code);
    else setStatus("Release ready for offline play.");
  };

  useEffect(() => {
    void PlayerDatabase.open()
      .then(async (db) => {
        const credentials = createParticipantCredentialStore();
        const sharedStore = new SharedSyncStore(db.raw());
        const coordinator = new SharedSyncCoordinator(sharedStore, credentials);
        sharedSyncCoordinator.current = coordinator;
        sharedSessionController.current = new SharedSessionController(
          sharedStore,
          credentials,
          coordinator,
        );
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

  const notifySharedSyncChanged = () => {
    reply({
      version: 1,
      requestId: "notification",
      type: "shared.sync.changed",
      payload: {},
    });
  };

  const scheduleSharedSync = async (
    sessionId: string,
    trigger: "enqueue" | "foreground" | "reconnect" | "retry",
  ) => {
    const coordinator = sharedSyncCoordinator.current;
    if (coordinator === null) throw new Error("shared-sync-coordinator-missing");
    await coordinator.request(sessionId, trigger);
    notifySharedSyncChanged();
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" || database === null || sharedSessionId === null) return;
      const controller = sharedSessionController.current;
      if (controller === null) return;
      void new SharedSyncStore(database.raw())
        .view(sharedSessionId)
        .then((view) =>
          view.transport === "offline" || view.transport === "degraded"
            ? controller.reconnect(sharedSessionId)
            : controller.foreground(sharedSessionId),
        )
        .then(notifySharedSyncChanged)
        .catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : "Shared synchronization failed");
          notifySharedSyncChanged();
        });
    });
    return () => subscription.remove();
  }, [database, sharedSessionId]);

  const onBridgeMessage = async (event: WebViewMessageEvent) => {
    if (database === null || runtime === null) return;
    let decodedType: unknown;
    try {
      decodedType = (JSON.parse(event.nativeEvent.data) as { readonly type?: unknown }).type;
    } catch {
      decodedType = undefined;
    }
    if (typeof decodedType === "string" && decodedType.startsWith("shared.")) {
      const store = new SharedSyncStore(database.raw());
      const handlers =
        sharedSessionId === null || runtime.sharedSurface.kind !== "bound"
          ? {
              getView: async (): Promise<SharedPlayView> => {
                throw new Error("shared-session-missing");
              },
              enqueue: async (): Promise<never> => {
                throw new Error("shared-session-missing");
              },
            }
          : createCompositionSharedBridgeHandlers({
              composition: runtime.composition,
              expectedReleaseId: runtime.recovery.releaseId,
              aggregateSchemaVersions: runtime.aggregateSchemaVersions,
              projectionContract:
                runtime.projectionContract ??
                (() => {
                  throw new Error("shared-projection-contract-missing");
                })(),
              getView: () => store.view(sharedSessionId),
              enqueue: async (command) => {
                const result = await store.enqueue(
                  sharedSessionId,
                  command,
                  new Date().toISOString(),
                );
                if (result.terminal === "pending") {
                  void scheduleSharedSync(sharedSessionId, "enqueue").catch((error: unknown) => {
                    setStatus(
                      error instanceof Error ? error.message : "Shared synchronization failed",
                    );
                    notifySharedSyncChanged();
                  });
                }
                return result;
              },
            });
      const response = await routeSharedBridgeMessage(event.nativeEvent.data, handlers);
      reply(response);
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
          composition: runtime.composition,
          aggregateSchemaId: runtime.aggregateSchemaId,
          validateSchema: runtime.validateSchema,
          validateProgression: runtime.validateProgression,
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
          if (recovered !== null && recovered.aggregate !== null) {
            setRuntime({
              ...runtime,
              recovery: { ...recovered, aggregate: recovered.aggregate },
            });
          }
        },
      }),
    );
    reply(response);
  };

  useLayoutEffect(() => {
    const mounted = webView.current;
    return () => {
      mounted?.injectJavaScript("void window.__plotpointDispose?.(); true;");
    };
  }, [runtime?.html, runtime?.sharedSurface.kind, scanning]);

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

  const joinSharedSession = async () => {
    if (database === null || runtime === null || runtime.sharedSurface.kind !== "join") return;
    setStatus("Joining shared play…");
    try {
      const controller = sharedSessionController.current;
      if (controller === null) throw new Error("shared-session-controller-missing");
      await controller.join({
        serviceUrl,
        sessionId: sessionCode,
        runId: runtime.recovery.runId,
        expectedReleaseId: runtime.recovery.releaseId,
        invitation,
      });
      setInvitation("");
      await loadRun(database, runtime.recovery, "Verified shared-session binding opened.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Shared join failed");
    }
  };

  const retrySharedSynchronization = async () => {
    if (sharedSessionId === null) return;
    const controller = sharedSessionController.current;
    if (controller === null) return;
    try {
      await controller.retry(sharedSessionId);
      notifySharedSyncChanged();
      if (database !== null && runtime !== null) {
        await loadRun(database, runtime.recovery, "Shared synchronization recovered.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Shared synchronization failed");
      notifySharedSyncChanged();
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
      {runtime?.sharedSurface.kind === "join" ? (
        <View style={styles.joinPanel}>
          <Text style={styles.detailLabel}>JOIN SHARED PLAY</Text>
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
            title="Join session"
            disabled={
              serviceUrl.length === 0 || sessionCode.length === 0 || invitation.length === 0
            }
            onPress={() => void joinSharedSession()}
          />
        </View>
      ) : null}
      {runtime?.sharedSurface.kind === "recovery" ? (
        <View style={styles.failurePanel}>
          <Text style={styles.detailLabel}>SHARED PLAY RECOVERY</Text>
          <Text selectable style={styles.failureCode}>
            {runtime.sharedSurface.code}
          </Text>
          <Text style={styles.failureAction}>
            Retry synchronization or reinstall the matching immutable release before continuing.
          </Text>
          {sharedSessionId === null ? null : (
            <Button
              title="Retry synchronization"
              onPress={() => void retrySharedSynchronization()}
            />
          )}
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
      ) : runtime.sharedSurface.kind === "join" || runtime.sharedSurface.kind === "recovery" ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {runtime.sharedSurface.kind === "join"
              ? "Shared session required."
              : "Shared binding unavailable."}
          </Text>
          <Text>The verified application mounts after the native shared boundary is ready.</Text>
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
