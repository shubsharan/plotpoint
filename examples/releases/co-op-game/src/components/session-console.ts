interface ComponentContext {
  readonly lifecycle: { defer(cleanup: () => void | Promise<void>): void };
  readonly shared?: {
    getView(): Promise<{
      readonly membership: { readonly status: "active" | "revoked" };
      readonly synchronization: "current" | "syncing" | "recovery-required" | "revoked";
    }>;
    onSyncChanged(listener: () => void): () => void;
  };
}

export function SessionConsole(context: ComponentContext): HTMLElement {
  if (context.shared === undefined) throw new Error("co-op-shared-context-missing");
  const consoleElement = document.createElement("output");
  consoleElement.dataset.component = "co-op.session-console";
  const refresh = async () => {
    const view = await context.shared?.getView();
    if (view === undefined) return;
    consoleElement.textContent = `${view.membership.status}:${view.synchronization}`;
  };
  context.lifecycle.defer(context.shared.onSyncChanged(() => void refresh()));
  void refresh();
  return consoleElement;
}
