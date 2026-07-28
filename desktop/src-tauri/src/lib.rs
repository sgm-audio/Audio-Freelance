//! Thin desktop shell: start `run.py`, show the Next dashboard, shut down on quit.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

const FRONTEND_URL: &str = "http://127.0.0.1:3000";
const FRONTEND_ADDR: &str = "127.0.0.1:3000";
const READY_TIMEOUT: Duration = Duration::from_secs(90);
const POLL_INTERVAL: Duration = Duration::from_millis(500);

struct StackGuard {
    root: PathBuf,
    child: Option<Child>,
    shut_down: bool,
}

impl StackGuard {
    fn shutdown(&mut self) {
        if self.shut_down {
            return;
        }
        self.shut_down = true;

        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        let mut cmd = python_command();
        cmd.arg("run.py")
            .arg("--shutdown")
            .current_dir(&self.root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        apply_no_window(&mut cmd);
        let _ = cmd.status();
    }
}

impl Drop for StackGuard {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn python_command() -> Command {
    if which("python").is_some() {
        Command::new("python")
    } else {
        let mut cmd = Command::new("py");
        cmd.arg("-3");
        cmd
    }
}

fn which(name: &str) -> Option<PathBuf> {
    let Ok(path) = std::env::var("PATH") else {
        return None;
    };
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
        #[cfg(windows)]
        {
            let exe = dir.join(format!("{name}.exe"));
            if exe.is_file() {
                return Some(exe);
            }
            let cmd = dir.join(format!("{name}.cmd"));
            if cmd.is_file() {
                return Some(cmd);
            }
        }
    }
    None
}

#[cfg(windows)]
fn apply_no_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn apply_no_window(_cmd: &mut Command) {}

fn repo_root() -> Result<PathBuf, String> {
    if let Ok(root) = std::env::var("AUDIO_FREELANCE_ROOT") {
        let p = PathBuf::from(root);
        if p.join("run.py").is_file() {
            return Ok(p);
        }
        return Err(format!(
            "AUDIO_FREELANCE_ROOT is set but run.py not found at {}",
            p.display()
        ));
    }

    let from_manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .map_err(|e| format!("resolve repo root: {e}"))?;
    if from_manifest.join("run.py").is_file() {
        return Ok(from_manifest);
    }

    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(Path::to_path_buf);
        for _ in 0..6 {
            let Some(d) = dir else { break };
            if d.join("run.py").is_file() {
                return Ok(d);
            }
            dir = d.parent().map(Path::to_path_buf);
        }
    }

    Err("Could not find repo root (run.py). Set AUDIO_FREELANCE_ROOT.".into())
}

fn port_open(addr: &str) -> bool {
    let Ok(mut addrs) = addr.to_socket_addrs() else {
        return false;
    };
    let Some(sock) = addrs.next() else {
        return false;
    };
    let sock: SocketAddr = sock;
    TcpStream::connect_timeout(&sock, Duration::from_millis(400)).is_ok()
}

fn wait_for_frontend() -> Result<(), String> {
    let start = Instant::now();
    while start.elapsed() < READY_TIMEOUT {
        if port_open(FRONTEND_ADDR) && http_ok_ish(FRONTEND_ADDR) {
            return Ok(());
        }
        std::thread::sleep(POLL_INTERVAL);
    }
    Err(format!(
        "Frontend did not become ready on {FRONTEND_URL} within {}s.",
        READY_TIMEOUT.as_secs()
    ))
}

fn http_ok_ish(addr: &str) -> bool {
    let Ok(mut addrs) = addr.to_socket_addrs() else {
        return false;
    };
    let Some(sock) = addrs.next() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&sock, Duration::from_millis(800)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let req = b"GET / HTTP/1.1\r\nHost: 127.0.0.1:3000\r\nConnection: close\r\n\r\n";
    if stream.write_all(req).is_err() {
        return false;
    }
    let mut buf = [0u8; 64];
    match stream.read(&mut buf) {
        Ok(n) if n > 0 => {
            let s = String::from_utf8_lossy(&buf[..n]);
            s.starts_with("HTTP/1.")
        }
        _ => false,
    }
}

fn read_log_tail(root: &Path, name: &str) -> String {
    let path = root.join("data").join(name);
    let Ok(text) = std::fs::read_to_string(&path) else {
        return String::new();
    };
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(30);
    lines[start..].join("\n")
}

fn failure_message(root: &Path, err: &str) -> String {
    let mut msg = format!(
        "{err}\n\nFix deps with: uv sync && cd frontend && npm install\nThen retry."
    );
    let be = read_log_tail(root, "run-backend.log");
    let fe = read_log_tail(root, "run-frontend.log");
    if !be.is_empty() {
        msg.push_str("\n\n--- run-backend.log ---\n");
        msg.push_str(&be);
    }
    if !fe.is_empty() {
        msg.push_str("\n\n--- run-frontend.log ---\n");
        msg.push_str(&fe);
    }
    msg
}

fn show_error(title: &str, message: &str) {
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title(title)
        .set_description(message)
        .show();
}

fn spawn_run_py(root: &Path) -> Result<Option<Child>, String> {
    let mut cmd = python_command();
    cmd.arg("run.py")
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    apply_no_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start python run.py: {e}"))?;

    // If both services were already healthy, run.py exits 0 quickly.
    std::thread::sleep(Duration::from_millis(800));
    match child.try_wait() {
        Ok(Some(status)) if status.success() => Ok(None),
        Ok(Some(status)) => Err(format!(
            "run.py exited early with {status}. Run: python run.py --verbose"
        )),
        Ok(None) => Ok(Some(child)),
        Err(e) => Err(format!("Failed to poll run.py: {e}")),
    }
}

fn start_and_navigate(app: AppHandle) {
    let root = match repo_root() {
        Ok(r) => r,
        Err(e) => {
            show_error("Audio-Freelance", &e);
            let _ = app.exit(1);
            return;
        }
    };

    let child = match spawn_run_py(&root) {
        Ok(c) => c,
        Err(e) => {
            show_error("Audio-Freelance", &failure_message(&root, &e));
            let _ = app.exit(1);
            return;
        }
    };

    {
        let state = app.state::<Mutex<StackGuard>>();
        if let Ok(mut guard) = state.lock() {
            guard.root = root.clone();
            guard.child = child;
            guard.shut_down = false;
        };
    }

    if let Err(e) = wait_for_frontend() {
        show_error("Audio-Freelance", &failure_message(&root, &e));
        if let Ok(mut guard) = app.state::<Mutex<StackGuard>>().lock() {
            guard.shutdown();
        }
        let _ = app.exit(1);
        return;
    }

    let external = match FRONTEND_URL.parse::<url::Url>() {
        Ok(u) => u,
        Err(e) => {
            show_error("Audio-Freelance", &format!("Bad URL: {e}"));
            let _ = app.exit(1);
            return;
        }
    };

    let Some(window) = app.get_webview_window("main") else {
        show_error("Audio-Freelance", "Main window missing.");
        let _ = app.exit(1);
        return;
    };

    if let Err(e) = window.navigate(external) {
        show_error(
            "Audio-Freelance",
            &format!("Failed to open dashboard: {e}\n\nTry {FRONTEND_URL} in a browser."),
        );
        let _ = app.exit(1);
        return;
    }
    let _ = window.set_title("Audio-Freelance");
}

fn shutdown_from_app(app: &AppHandle) {
    if let Some(state) = app.try_state::<Mutex<StackGuard>>() {
        if let Ok(mut guard) = state.lock() {
            guard.shutdown();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let root = repo_root().unwrap_or_else(|_| PathBuf::from("."));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(StackGuard {
            root,
            child: None,
            shut_down: false,
        }))
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || start_and_navigate(handle));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                shutdown_from_app(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Audio-Freelance desktop shell")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                shutdown_from_app(app_handle);
            }
        });
}
