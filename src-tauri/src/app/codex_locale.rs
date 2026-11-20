use std::path::PathBuf;
use std::time::Duration;

use codex_theme_engine::cdp::{connect_codex_targets, CdpSession};
use codex_theme_engine::native_hot::{read_locale_override, write_values};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::Mutex;

use crate::app::{atomic_file, codex_theme, paths};
use crate::errors::AppError;

const LOCALE: &str = "zh-CN";
const SETTING: &str = "localeOverride";
const BOOT_SCRIPT: &str = include_str!("codex_locale_boot.js");
const STARTUP_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Default, Serialize, Deserialize)]
struct Preference {
    enabled: bool,
    previous: Option<SavedLocale>,
}

// A saved null means Codex was following the system language.
#[derive(Serialize, Deserialize)]
struct SavedLocale {
    value: Option<String>,
}

impl Preference {
    fn path() -> Result<PathBuf, AppError> {
        paths::data_dir()
            .map(|dir| dir.join("codex-locale.json"))
            .ok_or_else(|| AppError::Internal("无法定位汉化设置目录".into()))
    }

    fn load() -> Result<Self, AppError> {
        let path = Self::path()?;
        if !path.try_exists().map_err(locale_error)?
            && !atomic_file::backup_path(&path)
                .try_exists()
                .map_err(locale_error)?
        {
            return Ok(Self::default());
        }
        atomic_file::read_with_recovery(&path)
            .0
            .ok_or_else(|| AppError::Internal("汉化设置及备份无法读取".into()))
    }

    fn save(&self) -> Result<(), AppError> {
        let bytes = serde_json::to_vec(self).map_err(locale_error)?;
        atomic_file::write_atomic(&Self::path()?, &bytes).map_err(locale_error)
    }
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LocalePhase {
    Off,
    Pending,
    Active,
    Restoring,
    Failed,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocaleStatus {
    enabled: bool,
    phase: LocalePhase,
}

#[derive(Default)]
pub struct LocaleService {
    runtime: Mutex<Runtime>,
}

#[derive(Default)]
struct Runtime {
    session: Option<CdpSession>,
    failed: bool,
}

impl Runtime {
    fn active(&self) -> bool {
        self.session
            .as_ref()
            .is_some_and(|session| !session.closed())
    }

    fn clear_session(&mut self) {
        if let Some(session) = self.session.take() {
            session.close();
        }
    }

    fn status(&self, preference: &Preference) -> LocaleStatus {
        let phase = if self.failed {
            LocalePhase::Failed
        } else if preference.enabled {
            if self.active() {
                LocalePhase::Active
            } else {
                LocalePhase::Pending
            }
        } else if preference.previous.is_some() || self.active() {
            LocalePhase::Restoring
        } else {
            LocalePhase::Off
        };
        LocaleStatus {
            enabled: preference.enabled,
            phase,
        }
    }
}

impl LocaleService {
    pub async fn status(&self) -> Result<LocaleStatus, AppError> {
        let runtime = self.runtime.lock().await;
        Ok(runtime.status(&Preference::load()?))
    }

    pub async fn set_enabled(&self, enabled: bool) -> Result<(), AppError> {
        let mut runtime = self.runtime.lock().await;
        let mut preference = Preference::load()?;
        preference.enabled = enabled;
        preference.save()?;
        runtime.failed = false;
        Ok(())
    }

    pub async fn has_work(&self) -> Result<bool, AppError> {
        let runtime = self.runtime.lock().await;
        let preference = Preference::load()?;
        Ok(preference.enabled || preference.previous.is_some() || runtime.active())
    }

    pub async fn prepare_launch(
        &self,
        restart: bool,
        disable_self_updates: bool,
    ) -> Result<bool, AppError> {
        let mut runtime = self.runtime.lock().await;
        let mut preference = Preference::load()?;
        if !preference.enabled && preference.previous.is_none() && !runtime.active() {
            return Ok(false);
        }
        match codex_theme::start_for_locale(restart, disable_self_updates).await {
            Ok(true) => {}
            Ok(false) => return Ok(false),
            Err(error) => {
                runtime.failed = true;
                log::warn!("Codex locale launch failed, falling back to ordinary launch: {error}");
                return Ok(false);
            }
        }
        runtime.clear_session();
        if !preference.enabled && preference.previous.is_none() {
            runtime.failed = false;
            return Ok(true);
        }
        sync_running(&mut runtime, &mut preference).await;
        Ok(true)
    }

    /// A theme change can start a fresh renderer after the language was applied.
    pub async fn after_themed_launch(&self) -> Result<(), AppError> {
        let mut runtime = self.runtime.lock().await;
        let mut preference = Preference::load()?;
        if !runtime.active() && (preference.enabled || preference.previous.is_some()) {
            runtime.clear_session();
            sync_running(&mut runtime, &mut preference).await;
        }
        Ok(())
    }
}

async fn sync_running(runtime: &mut Runtime, preference: &mut Preference) {
    match apply_to_renderer(preference).await {
        Ok(session) => {
            runtime.session = session;
            runtime.failed = false;
        }
        Err(error) => {
            runtime.failed = true;
            log::warn!("Codex locale could not be applied: {error}");
        }
    }
}

async fn apply_to_renderer(preference: &mut Preference) -> Result<Option<CdpSession>, AppError> {
    let mut targets = connect_codex_targets(codex_theme::THEME_CDP_PORT, STARTUP_TIMEOUT)
        .await
        .map_err(locale_error)?
        .into_iter();
    let session = targets.next().expect("verified Codex renderer").session;
    for target in targets {
        target.session.close();
    }
    let result = update_locale(&session, preference).await;
    if matches!(result, Ok(true)) {
        return Ok(Some(session));
    }
    session.close();
    result.map(|_| None)
}

async fn update_locale(
    session: &CdpSession,
    preference: &mut Preference,
) -> Result<bool, AppError> {
    let version = tauri::async_runtime::spawn_blocking(codex_theme::codex_version_hint)
        .await
        .map_err(locale_error)?;
    let version = version.as_deref();
    let current = read_locale_override(session, version)
        .await
        .map_err(locale_error)?;
    if preference.enabled {
        if preference.previous.is_none() || current.as_deref() != Some(LOCALE) {
            preference.previous = Some(SavedLocale {
                value: current.clone(),
            });
            // Record the original before the host write so retry can recover it.
            preference.save()?;
        }
        if current.as_deref() != Some(LOCALE) {
            write_values(session, &[(SETTING, json!(LOCALE))], version)
                .await
                .map_err(locale_error)?;
        }
        session
            .send(
                "Page.addScriptToEvaluateOnNewDocument",
                json!({ "source": BOOT_SCRIPT }),
            )
            .await
            .map_err(locale_error)?;
        session
            .send("Page.reload", json!({}))
            .await
            .map_err(locale_error)?;
        wait_for_chinese(session).await?;
        return Ok(true);
    }

    if let Some(previous) = preference.previous.take() {
        if current.as_deref() == Some(LOCALE) && previous.value.as_deref() != Some(LOCALE) {
            write_values(session, &[(SETTING, json!(previous.value))], version)
                .await
                .map_err(locale_error)?;
            if read_locale_override(session, version)
                .await
                .map_err(locale_error)?
                != previous.value
            {
                return Err(AppError::Engine("Codex 未恢复原来的语言设置".into()));
            }
            session
                .send("Page.reload", json!({}))
                .await
                .map_err(locale_error)?;
        }
        preference.save()?;
    }
    Ok(false)
}

async fn wait_for_chinese(session: &CdpSession) -> Result<(), AppError> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    loop {
        if session
            .evaluate(
                "window.__camCodexLocaleBoot === true && document.documentElement.lang.toLowerCase() === 'zh-cn'",
            )
            .await
            .is_ok_and(|value| value == true)
        {
            return Ok(());
        }
        if session.closed() || tokio::time::Instant::now() >= deadline {
            return Err(AppError::Engine("Codex 未载入简体中文界面".into()));
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

fn locale_error(error: impl std::fmt::Display) -> AppError {
    AppError::Engine(format!("Codex 汉化: {error}"))
}
