import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { managerApi, type CodexLocaleStatus } from "../../services/managerApi";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { Sheet } from "../Sheet";

const LABELS = {
  off: "locale.button",
  active: "locale.active",
  pending: "locale.pending",
  restoring: "locale.restoring",
  failed: "locale.failed",
} as const;

export function CodexLocaleButton({ disabled }: { disabled: boolean }) {
  const { t } = useI18n();
  const titleId = useId();
  const bodyId = useId();
  const [status, setStatus] = useState<CodexLocaleStatus>({ enabled: false, phase: "off" });
  const [open, setOpen] = useState(false);
  const [sheetHost, setSheetHost] = useState<Element | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const operation = useRef(false);

  useEffect(() => {
    let revision = 0;
    const refresh = () => {
      const next = ++revision;
      void managerApi.codexLocaleStatus().then(
        (value) => {
          if (next === revision && !operation.current) setStatus(value);
        },
        () => {},
      );
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("cam:codex-locale-changed", refresh);
    return () => {
      revision++;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("cam:codex-locale-changed", refresh);
    };
  }, []);

  async function configure(enabled: boolean, restart: boolean) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await managerApi.configureCodexLocale(enabled, restart);
      setStatus(result);
      if (result.phase !== "failed") setOpen(false);
    } catch {
      await managerApi.codexLocaleStatus().then(setStatus, () => {});
      setError(true);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  const toggling = status.phase === "off" || status.phase === "active";
  const target = toggling ? !status.enabled : status.enabled;
  const failed = error || status.phase === "failed";

  return (
    <>
      <button
        type="button"
        className="btn ghost codex-locale-button"
        onClick={(event) => {
          setSheetHost(event.currentTarget.closest(".pop"));
          setError(false);
          setOpen(true);
        }}
        disabled={disabled || busy}
        aria-haspopup="dialog"
      >
        <Icon name={status.phase === "active" ? "check" : "globe"} />
        {t(LABELS[status.phase])}
      </button>
      {sheetHost && createPortal(
        <Sheet
          open={open}
          onDismiss={() => setOpen(false)}
          dismissable={!busy}
          labelledBy={titleId}
          describedBy={bodyId}
          centeredInExpanded
        >
          <h3 id={titleId}>{t("locale.button")}</h3>
          <p id={bodyId}>{t(target ? "locale.enableBody" : "locale.disableBody")}</p>
          {failed && <p role="alert">{t("locale.error")}</p>}
          <div className="row2 sheet-actions">
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => void configure(toggling ? target : !target, false)}
            >
              {t(toggling ? "locale.later" : target ? "locale.disable" : "locale.enable")}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void configure(target, true)}
            >
              {t(busy ? "locale.applying" : "locale.now")}
            </button>
          </div>
        </Sheet>,
        sheetHost,
      )}
    </>
  );
}
