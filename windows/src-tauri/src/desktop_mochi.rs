use tauri::{AppHandle, Manager, WebviewWindow};

pub const WINDOW_LABEL: &str = "desktop-mochi";

pub fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(WINDOW_LABEL)
}

pub fn toggle(app: &AppHandle) -> bool {
    let Some(win) = window(app) else { return false };
    if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
        false
    } else {
        let _ = win.show();
        let _ = win.set_focus();
        true
    }
}

pub fn show(app: &AppHandle) -> bool {
    let Some(win) = window(app) else { return false };
    let _ = win.show();
    let _ = win.set_focus();
    true
}

pub fn hide(app: &AppHandle) -> bool {
    let Some(win) = window(app) else { return false };
    let _ = win.hide();
    true
}

pub fn set_position(app: &AppHandle, x: f64, y: f64) {
    let Some(win) = window(app) else { return };
    let (cx, cy) = if let Ok(Some(mon)) = win.current_monitor() {
        let scale = win.scale_factor().unwrap_or(1.0);
        let mon_size = mon.size().to_logical::<f64>(scale);
        let mon_pos = mon.position().to_logical::<f64>(scale);
        let min_x = mon_pos.x;
        let max_x = mon_pos.x + (mon_size.width - 140.0).max(0.0);
        let min_y = mon_pos.y;
        let max_y = mon_pos.y + (mon_size.height - 140.0).max(0.0);
        (x.clamp(min_x, max_x), y.clamp(min_y, max_y))
    } else {
        (x.max(0.0), y.max(0.0))
    };
    let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x: cx, y: cy }));
}

pub fn get_position(app: &AppHandle) -> Option<(f64, f64)> {
    let win = window(app)?;
    let pos = win.outer_position().ok()?;
    let scale = win.scale_factor().ok().unwrap_or(1.0);
    let logical = pos.to_logical::<f64>(scale);
    Some((logical.x, logical.y))
}
