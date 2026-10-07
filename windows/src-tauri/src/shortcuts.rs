use tauri::{AppHandle, Emitter};

pub fn start(app: AppHandle) {
    #[cfg(windows)]
    std::thread::spawn(move || {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            RegisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT,
            VK_SPACE, VK_A, VK_D, VK_G, VK_M, VK_OEM_4, VK_OEM_6,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            GetMessageW, MSG, WM_HOTKEY,
        };

        let mods: HOT_KEY_MODIFIERS = MOD_CONTROL | MOD_ALT | MOD_NOREPEAT;

        unsafe {
            // ID 1: Ctrl+Alt+Space -> openChat
            let _ = RegisterHotKey(None, 1, mods, VK_SPACE.0 as u32);
            // ID 2: Ctrl+Alt+A -> goToAlert
            let _ = RegisterHotKey(None, 2, mods, VK_A.0 as u32);
            // ID 3: Ctrl+Alt+] (VK_OEM_6) -> nextPill
            let _ = RegisterHotKey(None, 3, mods, VK_OEM_6.0 as u32);
            // ID 4: Ctrl+Alt+[ (VK_OEM_4) -> prevPill
            let _ = RegisterHotKey(None, 4, mods, VK_OEM_4.0 as u32);
            // ID 5: Ctrl+Alt+M -> muteToggle
            let _ = RegisterHotKey(None, 5, mods, VK_M.0 as u32);
            // ID 6: Ctrl+Alt+D -> desktopToggle
            let _ = RegisterHotKey(None, 6, mods, VK_D.0 as u32);
            // ID 7: Ctrl+Alt+G -> wardrobeToggle
            let _ = RegisterHotKey(None, 7, mods, VK_G.0 as u32);

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                if msg.message == WM_HOTKEY {
                    let action = match msg.wParam.0 as i32 {
                        1 => "openChat",
                        2 => "goToAlert",
                        3 => "nextPill",
                        4 => "prevPill",
                        5 => "muteToggle",
                        6 => "desktopToggle",
                        7 => "wardrobeToggle",
                        _ => continue,
                    };
                    let _ = app.emit("global-shortcut", action.to_string());
                }
            }
        }
    });

    #[cfg(not(windows))]
    let _ = app;
}
