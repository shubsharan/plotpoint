import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { allowRuntimeNavigation } from "./bootstrap";
import { RuntimeDisposalCoordinator, type RuntimeDisposalOutcome } from "./runtime-disposal";

export interface ManagedRuntimeWebViewHandle {
  injectHostMessage(message: object): void;
  dispose(): Promise<RuntimeDisposalOutcome>;
}

interface ManagedRuntimeWebViewProps {
  readonly html: string;
  readonly mountIdentity: string;
  readonly onMessage: (event: WebViewMessageEvent) => void;
  readonly onDisposalFailure: (code: string) => void;
  readonly style?: StyleProp<ViewStyle>;
}

export const ManagedRuntimeWebView = forwardRef<
  ManagedRuntimeWebViewHandle,
  ManagedRuntimeWebViewProps
>(function ManagedRuntimeWebView(
  { html, mountIdentity, onMessage, onDisposalFailure, style },
  forwardedRef,
) {
  const webView = useRef<WebView>(null);
  const coordinator = useRef(new RuntimeDisposalCoordinator(mountIdentity));
  const disposal = useRef<Promise<RuntimeDisposalOutcome> | null>(null);
  const reportedFailure = useRef(false);
  const [phase, setPhase] = useState<"active" | "disposing" | "disposed">("active");

  const finish = (outcome: RuntimeDisposalOutcome): RuntimeDisposalOutcome => {
    setPhase("disposed");
    if (outcome.status === "failed" && !reportedFailure.current) {
      reportedFailure.current = true;
      onDisposalFailure(outcome.code);
    }
    return outcome;
  };

  const requestDisposal = (): Promise<RuntimeDisposalOutcome> => {
    if (disposal.current !== null) return disposal.current;
    setPhase("disposing");
    disposal.current = coordinator.current
      .request((script) => {
        const mounted = webView.current;
        if (mounted === null) throw new Error("runtime-webview-missing");
        mounted.injectJavaScript(script);
      })
      .then(finish);
    return disposal.current;
  };

  const processTerminated = (
    code: "runtime-webview-content-process-terminated" | "runtime-webview-render-process-gone",
  ): void => {
    if (!coordinator.current.processTerminated(code)) return;
    finish({ status: "failed", code });
  };

  useImperativeHandle(
    forwardedRef,
    () => ({
      injectHostMessage(message) {
        if (phase === "disposed") return;
        webView.current?.injectJavaScript(
          `window.__plotpointReceive(${JSON.stringify(JSON.stringify(message))});true;`,
        );
      },
      dispose: requestDisposal,
    }),
    [phase],
  );

  if (phase === "disposed") return null;
  return (
    <WebView
      ref={webView}
      source={{ html, baseUrl: "about:blank" }}
      originWhitelist={["about:blank", "blob:*"]}
      onMessage={(event) => {
        if (!coordinator.current.consume(event.nativeEvent.data)) onMessage(event);
      }}
      onShouldStartLoadWithRequest={({ url }) => allowRuntimeNavigation(url)}
      onContentProcessDidTerminate={() =>
        processTerminated("runtime-webview-content-process-terminated")
      }
      onRenderProcessGone={() => processTerminated("runtime-webview-render-process-gone")}
      javaScriptEnabled
      domStorageEnabled={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      setSupportMultipleWindows={false}
      allowFileAccess={false}
      pointerEvents={phase === "disposing" ? "none" : "auto"}
      style={[style, phase === "disposing" ? styles.disposing : null]}
    />
  );
});

const styles = StyleSheet.create({
  disposing: { opacity: 0 },
});
