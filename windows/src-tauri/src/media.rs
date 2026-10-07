use serde::Serialize;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
}

#[cfg(windows)]
pub fn get_current_media() -> Option<MediaInfo> {
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };

    let async_op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().ok()?;
    let manager = async_op.get().ok()?;
    let session = manager.GetCurrentSession().ok()?;

    let props_op = session.TryGetMediaPropertiesAsync().ok()?;
    let props = props_op.get().ok()?;

    let title = props.Title().ok()?.to_string();
    let artist = props.Artist().ok().map(|s| s.to_string()).unwrap_or_default();
    let album = props.AlbumTitle().ok().map(|s| s.to_string()).unwrap_or_default();

    let playback_info = session.GetPlaybackInfo().ok();
    let playing = playback_info
        .and_then(|info| info.PlaybackStatus().ok())
        .map(|status| status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
        .unwrap_or(false);

    if title.trim().is_empty() {
        return None;
    }

    Some(MediaInfo {
        title: clean_title(&title),
        artist: clean_artist(&artist),
        album,
        playing,
    })
}

#[cfg(not(windows))]
pub fn get_current_media() -> Option<MediaInfo> {
    None
}

#[cfg(windows)]
pub fn play_pause() -> bool {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    let Ok(async_op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() else { return false };
    let Ok(manager) = async_op.get() else { return false };
    let Ok(session) = manager.GetCurrentSession() else { return false };
    let _ = session.TryTogglePlayPauseAsync();
    true
}

#[cfg(not(windows))]
pub fn play_pause() -> bool {
    false
}

#[cfg(windows)]
pub fn next_track() -> bool {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    let Ok(async_op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() else { return false };
    let Ok(manager) = async_op.get() else { return false };
    let Ok(session) = manager.GetCurrentSession() else { return false };
    let _ = session.TrySkipNextAsync();
    true
}

#[cfg(not(windows))]
pub fn next_track() -> bool {
    false
}

#[cfg(windows)]
pub fn previous_track() -> bool {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    let Ok(async_op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() else { return false };
    let Ok(manager) = async_op.get() else { return false };
    let Ok(session) = manager.GetCurrentSession() else { return false };
    let _ = session.TrySkipPreviousAsync();
    true
}

#[cfg(not(windows))]
pub fn previous_track() -> bool {
    false
}

/// Strip trailing groups like (Remastered) or [Official Audio]
fn clean_title(raw: &str) -> String {
    let mut s = raw.trim();
    if let Some(pos) = s.find(" - ") {
        s = &s[..pos];
    }
    let mut title = s.to_string();
    loop {
        let trimmed = title.trim();
        if trimmed.ends_with(')') {
            if let Some(open) = trimmed.rfind('(') {
                title = trimmed[..open].to_string();
                continue;
            }
        }
        if trimmed.ends_with(']') {
            if let Some(open) = trimmed.rfind('[') {
                title = trimmed[..open].to_string();
                continue;
            }
        }
        break;
    }
    let out = title.trim().to_string();
    if out.is_empty() { raw.to_string() } else { out }
}

/// Clean featured artist tags
fn clean_artist(raw: &str) -> String {
    let lower = raw.to_lowercase();
    for tag in &[" feat.", " ft.", " feat ", " ft "] {
        if let Some(pos) = lower.find(tag) {
            let prefix = raw[..pos].trim();
            if !prefix.is_empty() {
                return prefix.to_string();
            }
        }
    }
    raw.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_title() {
        assert_eq!(clean_title("Track - Subtitle"), "Track");
        assert_eq!(clean_title("Bohemian Rhapsody (2011 Remaster)"), "Bohemian Rhapsody");
        assert_eq!(clean_title("Song [Official Music Video]"), "Song");
        assert_eq!(clean_title("Complex Song (Live) [Deluxe]"), "Complex Song");
        assert_eq!(clean_title("Regular Title"), "Regular Title");
        assert_eq!(clean_title(""), "");
    }

    #[test]
    fn test_clean_artist() {
        assert_eq!(clean_artist("Drake feat. Rihanna"), "Drake");
        assert_eq!(clean_artist("Eminem ft. Rihanna"), "Eminem");
        assert_eq!(clean_artist("Kendrick Lamar"), "Kendrick Lamar");
        assert_eq!(clean_artist("Daiv feat Someone Else"), "Daiv");
    }
}
