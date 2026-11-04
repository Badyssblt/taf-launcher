//! Installation et mise a jour d'un jeu a partir d'un manifeste (voir tools/make-release.mjs).
//!
//! Le build est decoupe en archives de moins de 2 Go (limite des releases GitHub) : les fichiers du jeu sont
//! mis bout a bout dans un flux unique, chaque fichier connait son decalage (`offset`) dans ce flux, et le flux
//! est coupe en `parts`. Le launcher ne telecharge que les fichiers manquants ou modifies, grace aux requetes
//! HTTP `Range`, verifie chaque fichier par SHA-256 puis le place atomiquement.

use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

pub const STATE_FILE: &str = ".launcher-install.json";
/// Deux fichiers a moins de 512 Ko l'un de l'autre sont telecharges dans la meme requete.
const GAP_MERGE: u64 = 512 * 1024;
const WORKERS: usize = 3;
const MAX_RETRIES: u32 = 6;
const ALLOWED_PREFIX: &str = "https://github.com/";

/// Les telechargements ne sont autorises que depuis GitHub (les tests ajoutent le serveur local).
fn url_allowed(url: &str) -> bool {
    url.starts_with(ALLOWED_PREFIX) || (cfg!(test) && url.starts_with("http://127.0.0.1"))
}

#[allow(dead_code)]
#[derive(Deserialize, Clone, Debug)]
pub struct Manifest {
    pub schema: u32,
    pub game: String,
    pub version: String,
    pub parts: Vec<Part>,
    pub files: Vec<FileEntry>,
}

#[allow(dead_code)]
#[derive(Deserialize, Clone, Debug)]
pub struct Part {
    pub name: String,
    pub url: String,
    pub size: u64,
}

#[derive(Deserialize, Clone, Debug)]
pub struct FileEntry {
    pub path: String,
    pub size: u64,
    pub sha256: String,
    pub offset: u64,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct InstallState {
    /// Vide tant qu'une installation ou mise a jour n'est pas terminee (le jeu n'est alors pas jouable).
    pub version: String,
    pub files: HashMap<String, String>,
}

/// Etat d'avancement, envoye regulierement a l'interface.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub slug: String,
    pub phase: &'static str,
    pub done: u64,
    pub total: u64,
    pub speed: f64,
    pub file: String,
}

pub type ProgressFn = Arc<dyn Fn(Progress) + Send + Sync>;

struct Shared {
    slug: String,
    on_progress: Option<ProgressFn>,
    phase: Mutex<&'static str>,
    file: Mutex<String>,
    done: AtomicU64,
    total: AtomicU64,
    cancel: Arc<AtomicBool>,
}

impl Shared {
    fn emit(&self, speed: f64) {
        let Some(callback) = &self.on_progress else { return };
        callback(Progress {
            slug: self.slug.clone(),
            phase: *self.phase.lock().unwrap(),
            done: self.done.load(Ordering::Relaxed),
            total: self.total.load(Ordering::Relaxed),
            speed,
            file: self.file.lock().unwrap().clone(),
        });
    }
    fn set_phase(&self, phase: &'static str, total: u64) {
        *self.phase.lock().unwrap() = phase;
        self.done.store(0, Ordering::Relaxed);
        self.total.store(total, Ordering::Relaxed);
        self.emit(0.0);
    }
    fn check_cancel(&self) -> Result<(), String> {
        if self.cancel.load(Ordering::Relaxed) {
            Err("Annulé".into())
        } else {
            Ok(())
        }
    }
}

/// Chemin relatif sur et (pas de `..`, pas de chemin absolu, pas de lecteur).
pub fn safe_rel_path(path: &str) -> Result<PathBuf, String> {
    let normalized = path.replace('\\', "/");
    if normalized.is_empty() || normalized.contains(':') {
        return Err(format!("chemin invalide : {path}"));
    }
    let p = PathBuf::from(&normalized);
    for c in p.components() {
        if !matches!(c, Component::Normal(_)) {
            return Err(format!("chemin invalide : {path}"));
        }
    }
    Ok(p)
}

pub fn valid_slug(slug: &str) -> bool {
    !slug.is_empty() && slug.len() <= 40 && slug.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

pub fn read_state(game_dir: &Path) -> Option<InstallState> {
    let text = std::fs::read_to_string(game_dir.join(STATE_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_state(game_dir: &Path, state: &InstallState) -> Result<(), String> {
    std::fs::create_dir_all(game_dir).map_err(|e| e.to_string())?;
    let tmp = game_dir.join(format!("{STATE_FILE}.tmp"));
    std::fs::write(&tmp, serde_json::to_vec(state).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, game_dir.join(STATE_FILE)).map_err(|e| e.to_string())
}

fn validate(manifest: &Manifest) -> Result<(), String> {
    if manifest.schema != 1 {
        return Err("Format de manifeste non pris en charge. Mets le launcher à jour.".into());
    }
    let mut total_parts: u64 = 0;
    for p in &manifest.parts {
        if !url_allowed(&p.url) {
            return Err("Source de téléchargement non autorisée".into());
        }
        total_parts += p.size;
    }
    let mut seen = HashSet::new();
    let mut sorted: Vec<&FileEntry> = manifest.files.iter().collect();
    sorted.sort_by_key(|f| f.offset);
    let mut prev_end = 0u64;
    for f in sorted {
        safe_rel_path(&f.path)?;
        if f.path == STATE_FILE || !seen.insert(f.path.to_lowercase()) {
            return Err(format!("Manifeste invalide : {}", f.path));
        }
        if f.sha256.len() != 64 || !f.sha256.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(format!("Empreinte invalide : {}", f.path));
        }
        if f.offset < prev_end || f.offset + f.size > total_parts {
            return Err(format!("Manifeste incohérent : {}", f.path));
        }
        prev_end = f.offset + f.size;
    }
    Ok(())
}

fn hash_file_blocking(path: &Path, shared: &Shared) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        shared.check_cancel()?;
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        shared.done.fetch_add(n as u64, Ordering::Relaxed);
    }
    Ok(hex::encode(hasher.finalize()))
}

struct OpenFile {
    file: tokio::fs::File,
    hasher: Sha256,
    tmp: PathBuf,
    fin: PathBuf,
    written: u64,
}

/// Ecrit le flux entrant dans les bons fichiers, dans l'ordre, en verifiant chaque empreinte.
struct Writer<'a> {
    files: Vec<&'a FileEntry>,
    index: usize,
    current: Option<OpenFile>,
    game_dir: &'a Path,
    shared: &'a Shared,
    completed: &'a Mutex<HashMap<String, String>>,
}

impl Writer<'_> {
    async fn feed(&mut self, mut data: &[u8], pos: &mut u64) -> Result<(), String> {
        while !data.is_empty() {
            let Some(entry) = self.files.get(self.index).copied() else {
                *pos += data.len() as u64;
                return Ok(());
            };
            if *pos < entry.offset {
                let skip = (entry.offset - *pos).min(data.len() as u64) as usize;
                *pos += skip as u64;
                data = &data[skip..];
                continue;
            }
            if self.current.is_none() {
                if *pos != entry.offset {
                    return Err("Flux de téléchargement désynchronisé".into());
                }
                let fin = self.game_dir.join(safe_rel_path(&entry.path)?);
                if let Some(parent) = fin.parent() {
                    tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
                }
                let tmp = fin.with_file_name(format!("{}.dl-tmp", fin.file_name().unwrap().to_string_lossy()));
                let file = tokio::fs::File::create(&tmp).await.map_err(|e| format!("{} : {e}", entry.path))?;
                *self.shared.file.lock().unwrap() = entry.path.clone();
                self.current = Some(OpenFile { file, hasher: Sha256::new(), tmp, fin, written: 0 });
            }
            let cur = self.current.as_mut().unwrap();
            let remaining = entry.offset + entry.size - *pos;
            let n = remaining.min(data.len() as u64) as usize;
            cur.file.write_all(&data[..n]).await.map_err(|e| format!("Écriture impossible (disque plein ?) : {e}"))?;
            cur.hasher.update(&data[..n]);
            cur.written += n as u64;
            *pos += n as u64;
            data = &data[n..];
            self.shared.done.fetch_add(n as u64, Ordering::Relaxed);

            if cur.written == entry.size {
                let mut done = self.current.take().unwrap();
                done.file.flush().await.map_err(|e| e.to_string())?;
                drop(done.file);
                let digest = hex::encode(done.hasher.finalize());
                if !digest.eq_ignore_ascii_case(&entry.sha256) {
                    let _ = tokio::fs::remove_file(&done.tmp).await;
                    return Err(format!("Fichier corrompu : {}", entry.path));
                }
                // Remplace le fichier existant (mise a jour) ; sous Windows un jeu en cours bloquerait le renommage.
                let _ = tokio::fs::remove_file(&done.fin).await;
                tokio::fs::rename(&done.tmp, &done.fin).await.map_err(|e| format!("{} : {e}", entry.path))?;
                self.completed.lock().unwrap().insert(entry.path.clone(), entry.sha256.to_lowercase());
                self.index += 1;
            }
        }
        Ok(())
    }
}

async fn download_group(
    client: &reqwest::Client,
    manifest: &Manifest,
    game_dir: &Path,
    group: Vec<usize>,
    shared: &Arc<Shared>,
    completed: &Mutex<HashMap<String, String>>,
) -> Result<(), String> {
    let files: Vec<&FileEntry> = group.iter().map(|&i| &manifest.files[i]).collect();
    let start = files[0].offset;
    let end = files.last().map(|f| f.offset + f.size).unwrap_or(start);
    let mut bounds = Vec::with_capacity(manifest.parts.len());
    let mut acc = 0u64;
    for p in &manifest.parts {
        bounds.push((acc, acc + p.size));
        acc += p.size;
    }

    let mut writer = Writer { files, index: 0, current: None, game_dir, shared, completed };
    let mut pos = start;
    let mut failures = 0u32;
    while pos < end {
        shared.check_cancel()?;
        let (pi, &(pstart, pend)) = bounds.iter().enumerate().find(|(_, (s, e))| pos >= *s && pos < *e).ok_or("Position hors des archives")?;
        let from = pos - pstart;
        let to = end.min(pend) - pstart - 1;
        let target = end.min(pend);

        let attempt: Result<(), String> = async {
            let resp = client
                .get(&manifest.parts[pi].url)
                .header(reqwest::header::RANGE, format!("bytes={from}-{to}"))
                .send()
                .await
                .map_err(|e| e.to_string())?;
            let status = resp.status();
            if !(status.as_u16() == 206 || status.as_u16() == 200) {
                return Err(format!("Téléchargement refusé (HTTP {status})"));
            }
            // Serveur sans support des plages : on saute le debut nous-memes.
            let mut to_skip = if status.as_u16() == 200 { from } else { 0 };
            let mut stream = resp.bytes_stream();
            while let Some(chunk) = stream.next().await {
                shared.check_cancel()?;
                let chunk = chunk.map_err(|e| e.to_string())?;
                let mut slice: &[u8] = &chunk;
                if to_skip > 0 {
                    let n = to_skip.min(slice.len() as u64) as usize;
                    to_skip -= n as u64;
                    slice = &slice[n..];
                }
                let room = (target - pos) as usize;
                if slice.len() > room {
                    slice = &slice[..room];
                }
                writer.feed(slice, &mut pos).await?;
                if pos >= target {
                    break;
                }
            }
            Ok(())
        }
        .await;

        match attempt {
            Ok(()) if pos >= target => failures = 0,
            Ok(()) => {
                failures += 1; // flux coupe trop tot : on reprend a `pos`
            }
            Err(e) if e == "Annulé" || e.starts_with("Fichier corrompu") || e.starts_with("Écriture impossible") => return Err(e),
            Err(e) => {
                failures += 1;
                if failures > MAX_RETRIES {
                    return Err(format!("Téléchargement interrompu : {e}"));
                }
            }
        }
        if failures > MAX_RETRIES {
            return Err("Téléchargement interrompu".into());
        }
        if failures > 0 {
            tokio::time::sleep(Duration::from_millis(500 * 2u64.pow(failures.min(5)))).await;
        }
    }
    Ok(())
}

pub async fn sync(
    on_progress: ProgressFn,
    slug: String,
    manifest_url: String,
    game_dir: PathBuf,
    verify: bool,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    if !url_allowed(&manifest_url) {
        return Err("Source de manifeste non autorisée".into());
    }
    let shared = Arc::new(Shared {
        slug: slug.clone(),
        on_progress: Some(on_progress),
        phase: Mutex::new("checking"),
        file: Mutex::new(String::new()),
        done: AtomicU64::new(0),
        total: AtomicU64::new(0),
        cancel,
    });
    shared.emit(0.0);

    // Emission reguliere de la progression et de la vitesse.
    let finished = Arc::new(AtomicBool::new(false));
    let ticker = {
        let (shared, finished) = (shared.clone(), finished.clone());
        tokio::spawn(async move {
            let mut last = (Instant::now(), 0u64);
            let mut speed = 0.0f64;
            while !finished.load(Ordering::Relaxed) {
                tokio::time::sleep(Duration::from_millis(200)).await;
                let now = Instant::now();
                let done = shared.done.load(Ordering::Relaxed);
                let dt = now.duration_since(last.0).as_secs_f64();
                if dt > 0.0 && done >= last.1 {
                    let inst = (done - last.1) as f64 / dt;
                    speed = if speed == 0.0 { inst } else { speed * 0.8 + inst * 0.2 };
                }
                last = (now, done);
                shared.emit(speed);
            }
        })
    };

    let result = run_sync(&shared, &manifest_url, &game_dir, verify).await;
    finished.store(true, Ordering::Relaxed);
    let _ = ticker.await;
    if result.is_ok() {
        shared.set_phase("done", 0);
    }
    result
}

async fn run_sync(shared: &Arc<Shared>, manifest_url: &str, game_dir: &Path, verify: bool) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent(concat!("taf-launcher/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let manifest: Manifest = client
        .get(manifest_url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Manifeste inaccessible : {e}"))?
        .json()
        .await
        .map_err(|e| format!("Manifeste illisible : {e}"))?;
    validate(&manifest)?;
    let manifest = Arc::new(manifest);
    tokio::fs::create_dir_all(game_dir).await.map_err(|e| e.to_string())?;

    let old_state = read_state(game_dir).unwrap_or_default();

    // 1. Quels fichiers manquent ou different ?
    let mut needed: Vec<usize> = Vec::new();
    let mut ok_files: HashMap<String, String> = HashMap::new();
    let mut to_hash: Vec<usize> = Vec::new();
    for (i, f) in manifest.files.iter().enumerate() {
        let local = game_dir.join(safe_rel_path(&f.path)?);
        match tokio::fs::metadata(&local).await {
            Ok(m) if m.is_file() && m.len() == f.size => {
                let known = old_state.files.get(&f.path).map(|s| s.eq_ignore_ascii_case(&f.sha256)).unwrap_or(false);
                if known && !verify {
                    ok_files.insert(f.path.clone(), f.sha256.to_lowercase());
                } else {
                    to_hash.push(i);
                }
            }
            _ => needed.push(i),
        }
    }
    if !to_hash.is_empty() {
        let total: u64 = to_hash.iter().map(|&i| manifest.files[i].size).sum();
        shared.set_phase("verifying", total);
        for i in to_hash {
            let f = &manifest.files[i];
            let path = game_dir.join(safe_rel_path(&f.path)?);
            *shared.file.lock().unwrap() = f.path.clone();
            let sh = shared.clone();
            let digest = tokio::task::spawn_blocking(move || hash_file_blocking(&path, &sh)).await.map_err(|e| e.to_string())??;
            if digest.eq_ignore_ascii_case(&f.sha256) {
                ok_files.insert(f.path.clone(), f.sha256.to_lowercase());
            } else {
                needed.push(i);
            }
        }
    }

    // 2. Fichiers vides : crees directement, rien a telecharger.
    let mut download: Vec<usize> = Vec::new();
    for i in needed {
        let f = &manifest.files[i];
        if f.size == 0 {
            let local = game_dir.join(safe_rel_path(&f.path)?);
            if let Some(parent) = local.parent() {
                tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
            }
            tokio::fs::write(&local, b"").await.map_err(|e| e.to_string())?;
            ok_files.insert(f.path.clone(), f.sha256.to_lowercase());
        } else {
            download.push(i);
        }
    }
    download.sort_by_key(|&i| manifest.files[i].offset);

    // 3. Telechargement. Tant qu'il n'est pas termine, le jeu est marque non installe.
    if !download.is_empty() {
        write_state(game_dir, &InstallState { version: String::new(), files: old_state.files.clone() })?;
        let total: u64 = download.iter().map(|&i| manifest.files[i].size).sum();
        shared.set_phase("downloading", total);

        let mut groups: Vec<Vec<usize>> = Vec::new();
        for &i in &download {
            let f = &manifest.files[i];
            let join = groups.last().map(|g: &Vec<usize>| {
                let last = &manifest.files[*g.last().unwrap()];
                f.offset <= last.offset + last.size + GAP_MERGE
            });
            match join {
                Some(true) => groups.last_mut().unwrap().push(i),
                _ => groups.push(vec![i]),
            }
        }

        let completed: Arc<Mutex<HashMap<String, String>>> = Arc::new(Mutex::new(HashMap::new()));
        let sem = Arc::new(Semaphore::new(WORKERS));
        let mut tasks = tokio::task::JoinSet::new();
        for group in groups {
            let (client, manifest, game_dir, shared, completed, sem) =
                (client.clone(), manifest.clone(), game_dir.to_path_buf(), shared.clone(), completed.clone(), sem.clone());
            tasks.spawn(async move {
                let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
                download_group(&client, &manifest, &game_dir, group, &shared, &completed).await
            });
        }
        let mut first_error: Option<String> = None;
        while let Some(res) = tasks.join_next().await {
            let outcome = res.map_err(|e| e.to_string()).and_then(|r| r);
            if let Err(e) = outcome {
                shared.cancel.store(true, Ordering::Relaxed); // arrete les autres telechargements
                first_error.get_or_insert(e);
            }
        }
        if let Some(e) = first_error {
            return Err(e);
        }
        ok_files.extend(completed.lock().unwrap().drain());
    }

    // 4. Nettoyage des fichiers retires de la nouvelle version, puis marquage "installe".
    shared.set_phase("finalizing", 0);
    let keep: HashSet<&str> = manifest.files.iter().map(|f| f.path.as_str()).collect();
    for old in old_state.files.keys() {
        if !keep.contains(old.as_str()) {
            if let Ok(p) = safe_rel_path(old) {
                let _ = tokio::fs::remove_file(game_dir.join(p)).await;
            }
        }
    }
    write_state(game_dir, &InstallState { version: manifest.version.clone(), files: ok_files })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;
    use tokio::net::TcpListener;

    #[derive(Default)]
    struct ServerData {
        manifest: String,
        parts: Vec<Vec<u8>>,
        served: u64,
    }

    fn pseudo(len: usize, seed: u32) -> Vec<u8> {
        let mut x = seed.wrapping_mul(2654435761).wrapping_add(1);
        (0..len)
            .map(|_| {
                x = x.wrapping_mul(1664525).wrapping_add(1013904223);
                (x >> 24) as u8
            })
            .collect()
    }

    /// Construit une release : (manifeste JSON, archives) a partir de fichiers et d'une taille d'archive.
    fn release(files: &[(&str, Vec<u8>)], part_size: usize, version: &str, base: &str) -> (String, Vec<Vec<u8>>) {
        let mut blob = Vec::new();
        let mut entries = Vec::new();
        for (path, data) in files {
            entries.push(serde_json::json!({
                "path": path, "size": data.len(), "sha256": hex::encode(Sha256::digest(data)), "offset": blob.len()
            }));
            blob.extend_from_slice(data);
        }
        let parts: Vec<Vec<u8>> = blob.chunks(part_size).map(|c| c.to_vec()).collect();
        let part_meta: Vec<_> = parts
            .iter()
            .enumerate()
            .map(|(i, p)| serde_json::json!({ "name": format!("p{i}"), "url": format!("{base}/part/{i}"), "size": p.len() }))
            .collect();
        let manifest = serde_json::json!({ "schema": 1, "game": "test", "version": version, "parts": part_meta, "files": entries });
        (manifest.to_string(), parts)
    }

    async fn start_server(data: Arc<Mutex<ServerData>>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = listener.accept().await else { return };
                let data = data.clone();
                tokio::spawn(async move {
                    let mut buf = vec![0u8; 8192];
                    let mut len = 0;
                    loop {
                        let n = sock.read(&mut buf[len..]).await.unwrap_or(0);
                        if n == 0 {
                            return;
                        }
                        len += n;
                        if buf[..len].windows(4).any(|w| w == b"\r\n\r\n") {
                            break;
                        }
                    }
                    let req = String::from_utf8_lossy(&buf[..len]).to_string();
                    let path = req.split_whitespace().nth(1).unwrap_or("/").to_string();
                    let range = req.lines().find_map(|l| l.to_lowercase().strip_prefix("range: bytes=").map(|r| r.trim().to_string()));
                    let (status, body, extra) = {
                        let mut d = data.lock().unwrap();
                        if path == "/manifest.json" {
                            ("200 OK", d.manifest.clone().into_bytes(), String::new())
                        } else if let Some(i) = path.strip_prefix("/part/").and_then(|s| s.parse::<usize>().ok()) {
                            let part = d.parts[i].clone();
                            let (a, b) = match range.as_deref().and_then(|r| r.split_once('-')) {
                                Some((a, b)) => (a.parse::<usize>().unwrap(), b.parse::<usize>().unwrap().min(part.len() - 1)),
                                None => (0, part.len() - 1),
                            };
                            let slice = part[a..=b].to_vec();
                            d.served += slice.len() as u64;
                            ("206 Partial Content", slice, format!("Content-Range: bytes {a}-{b}/{}\r\n", part.len()))
                        } else {
                            ("404 Not Found", vec![], String::new())
                        }
                    };
                    let head = format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\n{extra}Connection: close\r\n\r\n", body.len());
                    use tokio::io::AsyncWriteExt;
                    let _ = sock.write_all(head.as_bytes()).await;
                    let _ = sock.write_all(&body).await;
                    let _ = sock.shutdown().await;
                });
            }
        });
        base
    }

    fn shared() -> Arc<Shared> {
        Arc::new(Shared {
            slug: "test".into(),
            on_progress: None,
            phase: Mutex::new("checking"),
            file: Mutex::new(String::new()),
            done: AtomicU64::new(0),
            total: AtomicU64::new(0),
            cancel: Arc::new(AtomicBool::new(false)),
        })
    }

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("taf-installer-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    #[tokio::test]
    async fn install_then_incremental_update() {
        let data = Arc::new(Mutex::new(ServerData::default()));
        let base = start_server(data.clone()).await;
        let url = format!("{base}/manifest.json");
        let dir = temp_dir("update");

        let a = pseudo(1500, 1);
        let b1 = pseudo(700, 2);
        let c = pseudo(2500, 3);
        let v1 = [("a.bin", a.clone()), ("sub/dir/b.bin", b1), ("empty.txt", vec![]), ("c.bin", c)];
        let (m, parts) = release(&v1, 1000, "1.0.0", &base);
        *data.lock().unwrap() = ServerData { manifest: m, parts, served: 0 };

        run_sync(&shared(), &url, &dir, false).await.unwrap();
        assert_eq!(std::fs::read(dir.join("a.bin")).unwrap(), a);
        assert_eq!(std::fs::read(dir.join("sub/dir/b.bin")).unwrap().len(), 700);
        assert_eq!(std::fs::read(dir.join("empty.txt")).unwrap().len(), 0);
        assert_eq!(std::fs::read(dir.join("c.bin")).unwrap().len(), 2500, "fichier a cheval sur plusieurs archives");
        let st = read_state(&dir).unwrap();
        assert_eq!(st.version, "1.0.0");
        assert_eq!(st.files.len(), 4);
        assert!(!dir.join("a.bin.dl-tmp").exists());

        // v2 : b change, c disparait, d apparait, a est identique.
        let b2 = pseudo(700, 99);
        let d = pseudo(300, 4);
        let v2 = [("a.bin", a.clone()), ("sub/dir/b.bin", b2.clone()), ("empty.txt", vec![]), ("d.bin", d.clone())];
        let (m, parts) = release(&v2, 1000, "2.0.0", &base);
        *data.lock().unwrap() = ServerData { manifest: m, parts, served: 0 };
        run_sync(&shared(), &url, &dir, false).await.unwrap();
        assert_eq!(std::fs::read(dir.join("sub/dir/b.bin")).unwrap(), b2);
        assert_eq!(std::fs::read(dir.join("d.bin")).unwrap(), d);
        assert!(!dir.join("c.bin").exists(), "fichier retire de la nouvelle version");
        let served = data.lock().unwrap().served;
        assert_eq!(served, 700 + 300, "seuls les fichiers modifies sont telecharges");
        assert_eq!(read_state(&dir).unwrap().version, "2.0.0");

        // Deja a jour : rien a telecharger.
        data.lock().unwrap().served = 0;
        run_sync(&shared(), &url, &dir, false).await.unwrap();
        assert_eq!(data.lock().unwrap().served, 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn verify_repairs_corrupted_file() {
        let data = Arc::new(Mutex::new(ServerData::default()));
        let base = start_server(data.clone()).await;
        let url = format!("{base}/manifest.json");
        let dir = temp_dir("verify");
        let a = pseudo(2200, 7);
        let (m, parts) = release(&[("a.bin", a.clone()), ("b.bin", pseudo(900, 8))], 1000, "1.0.0", &base);
        *data.lock().unwrap() = ServerData { manifest: m, parts, served: 0 };
        run_sync(&shared(), &url, &dir, false).await.unwrap();

        let mut broken = a.clone();
        broken[1000] ^= 0xFF; // meme taille, contenu different
        std::fs::write(dir.join("a.bin"), &broken).unwrap();
        data.lock().unwrap().served = 0;
        run_sync(&shared(), &url, &dir, true).await.unwrap();
        assert_eq!(std::fs::read(dir.join("a.bin")).unwrap(), a, "le mode verification repare le fichier");
        assert_eq!(data.lock().unwrap().served, 2200, "seul le fichier corrompu est retelecharge");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn rejects_tampered_download() {
        let data = Arc::new(Mutex::new(ServerData::default()));
        let base = start_server(data.clone()).await;
        let url = format!("{base}/manifest.json");
        let dir = temp_dir("tamper");
        let (m, mut parts) = release(&[("a.bin", pseudo(1500, 5))], 1000, "1.0.0", &base);
        parts[1][10] ^= 0x01; // l'archive est alteree apres calcul des empreintes
        *data.lock().unwrap() = ServerData { manifest: m, parts, served: 0 };
        let err = run_sync(&shared(), &url, &dir, false).await.unwrap_err();
        assert!(err.contains("corrompu"), "{err}");
        assert!(!dir.join("a.bin").exists(), "un fichier corrompu n'est jamais mis en place");
        let state = read_state(&dir).unwrap();
        assert_eq!(state.version, "", "le jeu reste marque non installe");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn rejects_path_traversal_and_foreign_hosts() {
        let data = Arc::new(Mutex::new(ServerData::default()));
        let base = start_server(data.clone()).await;
        let url = format!("{base}/manifest.json");
        let dir = temp_dir("evil");
        let (m, parts) = release(&[("../evil.bin", pseudo(100, 1))], 1000, "1.0.0", &base);
        *data.lock().unwrap() = ServerData { manifest: m, parts, served: 0 };
        assert!(run_sync(&shared(), &url, &dir, false).await.is_err());
        assert!(!dir.parent().unwrap().join("evil.bin").exists());

        assert!(safe_rel_path("C:/Windows/x").is_err());
        assert!(safe_rel_path("/etc/passwd").is_err());
        assert!(safe_rel_path("a/../../b").is_err());
        assert!(safe_rel_path("Taf/Binaries/Win64/Taf.exe").is_ok());

        let (m, parts) = release(&[("a.bin", pseudo(100, 1))], 1000, "1.0.0", "https://evil.example.com");
        *data.lock().unwrap() = ServerData { manifest: m, parts, served: 0 };
        let err = run_sync(&shared(), &url, &dir, false).await.unwrap_err();
        assert!(err.contains("non autorisée"), "{err}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
