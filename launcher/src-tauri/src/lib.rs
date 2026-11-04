use installer_core as installer;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

const KEYRING_SERVICE: &str = "fr.badyssblilita.launcher";

#[derive(Default)]
struct AppState {
    installs: Mutex<HashMap<String, Arc<AtomicBool>>>,
    running: Mutex<HashSet<String>>,
}

#[derive(Serialize)]
struct InstalledGame {
    slug: String,
    version: String,
}

fn game_dir(library_dir: &str, slug: &str) -> Result<PathBuf, String> {
    if !installer::valid_slug(slug) {
        return Err("Identifiant de jeu invalide".into());
    }
    if library_dir.trim().is_empty() {
        return Err("Dossier des jeux non défini".into());
    }
    Ok(PathBuf::from(library_dir).join(slug))
}

#[tauri::command]
fn default_library_dir(app: AppHandle) -> Result<String, String> {
    let base = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("games").to_string_lossy().into_owned())
}

#[tauri::command]
fn installed_games(library_dir: String) -> Vec<InstalledGame> {
    let Ok(entries) = std::fs::read_dir(&library_dir) else { return vec![] };
    entries
        .flatten()
        .filter_map(|e| {
            let slug = e.file_name().to_string_lossy().into_owned();
            if !installer::valid_slug(&slug) {
                return None;
            }
            let state = installer::read_state(&e.path())?;
            (!state.version.is_empty()).then_some(InstalledGame { slug, version: state.version })
        })
        .collect()
}

#[tauri::command]
async fn install_game(
    app: AppHandle,
    state: State<'_, AppState>,
    slug: String,
    manifest_url: String,
    library_dir: String,
    verify: bool,
) -> Result<(), String> {
    let dir = game_dir(&library_dir, &slug)?;
    if state.running.lock().unwrap().contains(&slug) {
        return Err("Ferme le jeu avant de le mettre à jour".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut installs = state.installs.lock().unwrap();
        if installs.contains_key(&slug) {
            return Err("Une installation est déjà en cours".into());
        }
        installs.insert(slug.clone(), cancel.clone());
    }
    let emitter = app.clone();
    let on_progress: installer::ProgressFn = Arc::new(move |p| {
        let _ = emitter.emit("install-progress", p);
    });
    let result = installer::sync(on_progress, slug.clone(), manifest_url, dir, verify, cancel).await;
    state.installs.lock().unwrap().remove(&slug);
    result
}

#[tauri::command]
fn cancel_install(state: State<'_, AppState>, slug: String) {
    if let Some(flag) = state.installs.lock().unwrap().get(&slug) {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
}

#[tauri::command]
fn launch_game(
    app: AppHandle,
    state: State<'_, AppState>,
    slug: String,
    library_dir: String,
    executable: String,
    args: Vec<String>,
) -> Result<(), String> {
    let dir = game_dir(&library_dir, &slug)?;
    if executable.trim().is_empty() {
        return Err("Aucun exécutable défini pour ce jeu".into());
    }
    if state.installs.lock().unwrap().contains_key(&slug) {
        return Err("Installation en cours".into());
    }
    if !state.running.lock().unwrap().insert(slug.clone()) {
        return Err("Le jeu est déjà lancé".into());
    }
    let launch = || -> Result<std::process::Child, String> {
        let installed = installer::read_state(&dir).map(|s| !s.version.is_empty()).unwrap_or(false);
        if !installed {
            return Err("Le jeu n'est pas installé".into());
        }
        let exe = dir.join(installer::safe_rel_path(&executable)?);
        let exe = exe.canonicalize().map_err(|_| format!("Exécutable introuvable : {executable}"))?;
        let root = dir.canonicalize().map_err(|e| e.to_string())?;
        if !exe.starts_with(&root) {
            return Err("Exécutable en dehors du dossier du jeu".into());
        }
        std::process::Command::new(&exe)
            .args(&args)
            .current_dir(exe.parent().unwrap_or(&root))
            .spawn()
            .map_err(|e| format!("Impossible de lancer le jeu : {e}"))
    };
    match launch() {
        Ok(mut child) => {
            std::thread::spawn(move || {
                let _ = child.wait();
                app.state::<AppState>().running.lock().unwrap().remove(&slug);
                let _ = app.emit("game-exited", slug);
            });
            Ok(())
        }
        Err(e) => {
            state.running.lock().unwrap().remove(&slug);
            Err(e)
        }
    }
}

#[tauri::command]
fn uninstall_game(state: State<'_, AppState>, slug: String, library_dir: String) -> Result<(), String> {
    let dir = game_dir(&library_dir, &slug)?;
    if state.running.lock().unwrap().contains(&slug) || state.installs.lock().unwrap().contains_key(&slug) {
        return Err("Le jeu est en cours d'utilisation".into());
    }
    // Garde-fou : on ne supprime qu'un dossier que le launcher a lui-meme installe.
    if !dir.join(installer::STATE_FILE).is_file() {
        return Err("Ce dossier n'a pas été installé par le launcher".into());
    }
    std::fs::remove_dir_all(&dir).map_err(|e| format!("Suppression impossible : {e}"))
}

#[tauri::command]
fn open_folder(slug: String, library_dir: String) -> Result<(), String> {
    let dir = game_dir(&library_dir, &slug)?;
    if !dir.is_dir() {
        return Err("Dossier introuvable".into());
    }
    std::process::Command::new("explorer").arg(&dir).spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, "refresh-token").map_err(|e| e.to_string())
}

#[tauri::command]
fn token_save(token: String) -> Result<(), String> {
    entry()?.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
fn token_load() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn token_clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            default_library_dir,
            installed_games,
            install_game,
            cancel_install,
            launch_game,
            uninstall_game,
            open_folder,
            token_save,
            token_load,
            token_clear,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement du launcher");
}
