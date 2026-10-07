// Local Windows Application Launcher
// Launches desktop apps from voice or chat commands ("Buka VS Code", "Buka Notepad", "Open Spotify", etc.)

use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppTarget {
    pub display_name: String,
    pub executable: String,
    pub arguments: Vec<String>,
}

/// Normalizes voice or chat query to extract the target application name.
/// E.g. "Buka VS Code" -> "vs code", "Open terminal" -> "terminal"
pub fn parse_app_command(input: &str) -> Option<String> {
    let lower = input.trim().to_lowercase();
    let cleaned = lower
        .replace(['.', '!', '?', ',', ';', '"', '\''], "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    let prefixes = [
        "tolong bukakan ",
        "tolong buka ",
        "bisakah kamu buka ",
        "bisa buka ",
        "mochi buka ",
        "hey mochi buka ",
        "hai mochi buka ",
        "coucou buka ",
        "please open ",
        "can you open ",
        "buka aplikasi ",
        "jalankan aplikasi ",
        "open app ",
        "launch app ",
        "buka ",
        "open ",
        "jalankan ",
        "start ",
        "launch ",
    ];

    for prefix in prefixes {
        if let Some(rest) = cleaned.strip_prefix(prefix) {
            let target = rest.trim();
            if !target.is_empty() {
                return Some(target.to_string());
            }
        }
    }

    None
}

/// Resolves an app query into known executable names or system paths.
pub fn resolve_app_target(query: &str) -> AppTarget {
    let q = query.trim().to_lowercase();
    match q.as_str() {
        "vs code" | "vscode" | "visual studio code" | "code" => AppTarget {
            display_name: "VS Code".into(),
            executable: "code".into(),
            arguments: vec![],
        },
        "notepad" | "catatan" | "notes" => AppTarget {
            display_name: "Notepad".into(),
            executable: "notepad.exe".into(),
            arguments: vec![],
        },
        "chrome" | "google chrome" => AppTarget {
            display_name: "Google Chrome".into(),
            executable: "chrome.exe".into(),
            arguments: vec![],
        },
        "edge" | "microsoft edge" => AppTarget {
            display_name: "Microsoft Edge".into(),
            executable: "msedge.exe".into(),
            arguments: vec![],
        },
        "firefox" | "mozilla firefox" => AppTarget {
            display_name: "Firefox".into(),
            executable: "firefox.exe".into(),
            arguments: vec![],
        },
        "spotify" | "musik" => AppTarget {
            display_name: "Spotify".into(),
            executable: "spotify.exe".into(),
            arguments: vec![],
        },
        "terminal" | "windows terminal" | "wt" | "console" => AppTarget {
            display_name: "Windows Terminal".into(),
            executable: "wt.exe".into(),
            arguments: vec![],
        },
        "powershell" | "pwsh" => AppTarget {
            display_name: "PowerShell".into(),
            executable: "powershell.exe".into(),
            arguments: vec![],
        },
        "cmd" | "command prompt" => AppTarget {
            display_name: "Command Prompt".into(),
            executable: "cmd.exe".into(),
            arguments: vec![],
        },
        "calc" | "calculator" | "kalkulator" => AppTarget {
            display_name: "Calculator".into(),
            executable: "calc.exe".into(),
            arguments: vec![],
        },
        "explorer" | "file explorer" | "files" | "berkas" => AppTarget {
            display_name: "File Explorer".into(),
            executable: "explorer.exe".into(),
            arguments: vec![],
        },
        "settings" | "pengaturan" => AppTarget {
            display_name: "Windows Settings".into(),
            executable: "ms-settings:".into(),
            arguments: vec![],
        },
        "task manager" | "taskmgr" => AppTarget {
            display_name: "Task Manager".into(),
            executable: "taskmgr.exe".into(),
            arguments: vec![],
        },
        "paint" | "mspaint" => AppTarget {
            display_name: "Paint".into(),
            executable: "mspaint.exe".into(),
            arguments: vec![],
        },
        "cursor" => AppTarget {
            display_name: "Cursor".into(),
            executable: "cursor".into(),
            arguments: vec![],
        },
        "discord" => AppTarget {
            display_name: "Discord".into(),
            executable: "Discord.exe".into(),
            arguments: vec![],
        },
        "slack" => AppTarget {
            display_name: "Slack".into(),
            executable: "slack.exe".into(),
            arguments: vec![],
        },
        "word" | "winword" | "microsoft word" => AppTarget {
            display_name: "Microsoft Word".into(),
            executable: "WINWORD.EXE".into(),
            arguments: vec![],
        },
        "excel" | "microsoft excel" => AppTarget {
            display_name: "Microsoft Excel".into(),
            executable: "EXCEL.EXE".into(),
            arguments: vec![],
        },
        "powerpoint" | "microsoft powerpoint" => AppTarget {
            display_name: "Microsoft PowerPoint".into(),
            executable: "POWERPNT.EXE".into(),
            arguments: vec![],
        },
        _ => {
            // For custom queries, preserve the query as target
            let exe = if q.ends_with(".exe") { q.clone() } else { format!("{q}.exe") };
            AppTarget {
                display_name: query.to_string(),
                executable: exe,
                arguments: vec![],
            }
        }
    }
}

/// Searches Windows Registry App Paths or system paths to locate the executable.
pub fn find_executable_path(target: &AppTarget) -> Option<PathBuf> {
    if target.executable.starts_with("ms-settings:") {
        return Some(PathBuf::from(&target.executable));
    }

    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    // 1. Check if direct executable name is in PATH via `where.exe`
    let mut where_cmd = Command::new("where.exe");
    #[cfg(windows)]
    where_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    if let Ok(output) = where_cmd.arg(&target.executable).output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = stdout.lines().next() {
                let p = PathBuf::from(first_line.trim());
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    // 2. Query Windows Registry App Paths
    // HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{app}
    // HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{app}
    let app_name = if target.executable.ends_with(".exe") {
        target.executable.clone()
    } else {
        format!("{}.exe", target.executable)
    };

    let reg_keys = [
        format!(r#"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{app_name}"#),
        format!(r#"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{app_name}"#),
    ];

    for reg_key in &reg_keys {
        let mut reg_cmd = Command::new("reg");
        #[cfg(windows)]
        reg_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        if let Ok(output) = reg_cmd.args(["query", reg_key, "/ve"]).output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if line.contains("REG_SZ") {
                        if let Some(pos) = line.find("REG_SZ") {
                            let raw_path = line[pos + 6..].trim().trim_matches('"');
                            let p = PathBuf::from(raw_path);
                            if p.exists() {
                                return Some(p);
                            }
                        }
                    }
                }
            }
        }
    }

    let exe_clean = if target.executable.ends_with(".exe") {
        target.executable.clone()
    } else {
        format!("{}.exe", target.executable)
    };

    let target_lower = target.display_name.to_lowercase();
    let exe_lower = target.executable.to_lowercase();

    // 3. App-specific known install paths
    // Spotify
    if target_lower.contains("spotify") || exe_lower.contains("spotify") {
        if let Ok(app_data) = std::env::var("APPDATA") {
            let p = PathBuf::from(&app_data).join("Spotify").join("Spotify.exe");
            if p.exists() {
                return Some(p);
            }
        }
    }

    // VS Code
    if target_lower.contains("code") || exe_lower.contains("code") {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(&local).join("Programs").join("Microsoft VS Code").join("Code.exe");
            if p.exists() {
                return Some(p);
            }
        }
        for var in &["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(pf) = std::env::var(var) {
                let p = PathBuf::from(&pf).join("Microsoft VS Code").join("Code.exe");
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    // Google Chrome
    if target_lower.contains("chrome") || exe_lower.contains("chrome") {
        for var in &["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(pf) = std::env::var(var) {
                let p = PathBuf::from(&pf).join("Google").join("Chrome").join("Application").join("chrome.exe");
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    // Microsoft Edge
    if target_lower.contains("edge") || exe_lower.contains("edge") {
        for var in &["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(pf) = std::env::var(var) {
                let p = PathBuf::from(&pf).join("Microsoft").join("Edge").join("Application").join("msedge.exe");
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    // Firefox
    if target_lower.contains("firefox") || exe_lower.contains("firefox") {
        for var in &["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(pf) = std::env::var(var) {
                let p = PathBuf::from(&pf).join("Mozilla Firefox").join("firefox.exe");
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    // 4. Generic Check in LOCALAPPDATA
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let candidates = [
            PathBuf::from(&local_app_data).join("Programs").join(&exe_clean),
            PathBuf::from(&local_app_data).join("Programs").join(target.display_name.replace(' ', "")).join(&exe_clean),
            PathBuf::from(&local_app_data).join("Microsoft").join("WindowsApps").join(&exe_clean),
        ];
        for c in &candidates {
            if c.exists() {
                return Some(c.clone());
            }
        }
    }

    // 5. Generic Check in Program Files and Program Files (x86)
    let pf_vars = ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"];
    for var in &pf_vars {
        if let Ok(pf) = std::env::var(var) {
            let candidates = [
                PathBuf::from(&pf).join(&target.display_name).join(&exe_clean),
                PathBuf::from(&pf).join(target.display_name.replace(' ', "")).join(&exe_clean),
            ];
            for c in &candidates {
                if c.exists() {
                    return Some(c.clone());
                }
            }
        }
    }

    None
}

/// Launches the requested application by name.
pub fn launch_app(query: &str) -> Result<String, String> {
    let app_name = parse_app_command(query).unwrap_or_else(|| query.to_string());
    let target = resolve_app_target(&app_name);

    // If it's a protocol like ms-settings:
    if target.executable.starts_with("ms-settings:") {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let mut cmd = Command::new("cmd");
            cmd.args(["/c", "start", "", &target.executable]);
            cmd.creation_flags(0x08000000);
            cmd.spawn()
                .map_err(|e| format!("Failed to open {}: {e}", target.display_name))?;
        }
        return Ok(format!("Opened {}", target.display_name));
    }

    // Find exact path or verify existence before launching
    let resolved_path = match find_executable_path(&target) {
        Some(p) => p,
        None => return Err(format!("Application '{}' not found", target.display_name)),
    };

    let exec_cmd = resolved_path.to_string_lossy().to_string();

    // Use cmd /c start with CREATE_NO_WINDOW so no black console window flashes
    let mut cmd = Command::new("cmd");
    cmd.args(["/c", "start", "", &exec_cmd]);
    for arg in &target.arguments {
        cmd.arg(arg);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    match cmd.spawn() {
        Ok(_) => Ok(format!("Opened {}", target.display_name)),
        Err(e) => Err(format!("Could not launch {}: {e}", target.display_name)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_app_command_indonesian() {
        assert_eq!(parse_app_command("Buka VS Code"), Some("vs code".into()));
        assert_eq!(parse_app_command("buka notepad"), Some("notepad".into()));
        assert_eq!(parse_app_command("Tolong buka Spotify!"), Some("spotify".into()));
        assert_eq!(parse_app_command("Hai Mochi buka Chrome"), Some("chrome".into()));
        assert_eq!(parse_app_command("jalankan terminal"), Some("terminal".into()));
    }

    #[test]
    fn test_parse_app_command_english() {
        assert_eq!(parse_app_command("Open VS Code"), Some("vs code".into()));
        assert_eq!(parse_app_command("please open notepad"), Some("notepad".into()));
        assert_eq!(parse_app_command("launch Spotify"), Some("spotify".into()));
        assert_eq!(parse_app_command("Open terminal."), Some("terminal".into()));
    }

    #[test]
    fn test_resolve_app_target() {
        let target_code = resolve_app_target("vs code");
        assert_eq!(target_code.display_name, "VS Code");
        assert_eq!(target_code.executable, "code");

        let target_notepad = resolve_app_target("notepad");
        assert_eq!(target_notepad.display_name, "Notepad");
        assert_eq!(target_notepad.executable, "notepad.exe");

        let target_spotify = resolve_app_target("spotify");
        assert_eq!(target_spotify.display_name, "Spotify");
        assert_eq!(target_spotify.executable, "spotify.exe");

        let target_terminal = resolve_app_target("terminal");
        assert_eq!(target_terminal.display_name, "Windows Terminal");
        assert_eq!(target_terminal.executable, "wt.exe");
    }

    #[test]
    fn test_find_executable_path_notepad() {
        let target = resolve_app_target("notepad");
        let path = find_executable_path(&target);
        assert!(path.is_some(), "notepad should be found on Windows");
    }

    #[test]
    fn test_find_executable_path_spotify() {
        let target = resolve_app_target("spotify");
        let path = find_executable_path(&target);
        assert!(path.is_some(), "spotify should be found on Windows");
    }

    #[test]
    fn test_find_executable_path_vscode() {
        let target = resolve_app_target("vs code");
        let path = find_executable_path(&target);
        assert!(path.is_some(), "vs code should be found on Windows");
    }

    #[test]
    fn test_launch_nonexistent_app_fails() {
        let res = launch_app("buka definitely_not_a_real_app_xyz_12345");
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("not found"));
    }
}

