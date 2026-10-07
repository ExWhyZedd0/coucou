use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowContext {
    pub app_name: String,
    pub title: String,
    pub url: Option<String>,
}

#[cfg(windows)]
pub fn capture_active_window() -> Option<WindowContext> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};

    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }

        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        let title = if len > 0 {
            String::from_utf16_lossy(&title_buf[..len as usize])
        } else {
            String::new()
        };

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));

        let mut app_name = String::new();
        if pid != 0 {
            if let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                let mut path_buf = [0u16; 1024];
                let mut size = path_buf.len() as u32;
                if QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, windows::core::PWSTR(path_buf.as_mut_ptr()), &mut size).is_ok() {
                    let full_path = String::from_utf16_lossy(&path_buf[..size as usize]);
                    if let Some(exe_name) = std::path::Path::new(&full_path).file_name() {
                        app_name = exe_name.to_string_lossy().to_string();
                    }
                }
            }
        }

        if app_name.is_empty() && title.is_empty() {
            return None;
        }

        Some(WindowContext {
            app_name: if app_name.is_empty() { "Unknown".to_string() } else { app_name },
            title,
            url: None,
        })
    }
}

#[cfg(not(windows))]
pub fn capture_active_window() -> Option<WindowContext> {
    None
}
