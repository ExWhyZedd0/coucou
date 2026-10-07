// End-to-end encryption using AES-256-GCM for Coucou LAN sync.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::RngCore;

pub const KEY_LEN: usize = 32;
pub const NONCE_LEN: usize = 12;

/// Generates a random 32-byte secret key formatted as a 64-character lowercase hex string.
pub fn generate_secret() -> String {
    let mut bytes = [0u8; KEY_LEN];
    rand::thread_rng().fill_bytes(&mut bytes);
    let mut s = String::with_capacity(KEY_LEN * 2);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(s, "{:02x}", b);
    }
    s
}

/// Parses a 32-byte key from a 64-char hex string or pads/hashes if different.
pub fn parse_key(secret: &str) -> [u8; KEY_LEN] {
    let clean = secret.trim();
    if clean.len() == 64 {
        if let Ok(bytes) = hex_to_bytes(clean) {
            if bytes.len() == KEY_LEN {
                let mut out = [0u8; KEY_LEN];
                out.copy_from_slice(&bytes);
                return out;
            }
        }
    }
    // Fallback: derive 32-byte key from whatever string was given (deterministic XOR folding matching Dart)
    let mut key = [0u8; KEY_LEN];
    let bytes = clean.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        key[i % KEY_LEN] ^= b;
    }
    key
}

fn hex_to_bytes(s: &str) -> Result<Vec<u8>, ()> {
    if s.len() % 2 != 0 {
        return Err(());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| ()))
        .collect()
}

/// Encrypts plaintext bytes using AES-256-GCM.
/// Returns (base64_iv, base64_ciphertext_with_tag).
pub fn encrypt(secret_key: &[u8; KEY_LEN], plaintext: &[u8]) -> Result<(String, String), String> {
    let cipher = Aes256Gcm::new_from_slice(secret_key).map_err(|e| format!("cipher init: {e}"))?;

    let mut iv = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut iv);
    let nonce = Nonce::from_slice(&iv);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("encryption failed: {e}"))?;

    let iv_b64 = BASE64.encode(iv);
    let payload_b64 = BASE64.encode(ciphertext);

    Ok((iv_b64, payload_b64))
}

/// Decrypts ciphertext using AES-256-GCM from base64 iv and base64 payload.
pub fn decrypt(secret_key: &[u8; KEY_LEN], iv_b64: &str, payload_b64: &str) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(secret_key).map_err(|e| format!("cipher init: {e}"))?;

    let iv = BASE64.decode(iv_b64).map_err(|e| format!("invalid iv base64: {e}"))?;
    if iv.len() != NONCE_LEN {
        return Err(format!("iv must be {} bytes, got {}", NONCE_LEN, iv.len()));
    }

    let ciphertext = BASE64
        .decode(payload_b64)
        .map_err(|e| format!("invalid payload base64: {e}"))?;

    let nonce = Nonce::from_slice(&iv);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| "decryption failed (bad key or corrupted payload)".to_string())?;

    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secret_generation() {
        let s = generate_secret();
        assert_eq!(s.len(), 64);
        let key = parse_key(&s);
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let s = generate_secret();
        let key = parse_key(&s);
        let message = b"hello from coucou sync bridge!";

        let (iv, payload) = encrypt(&key, message).expect("encrypt");
        let decrypted = decrypt(&key, &iv, &payload).expect("decrypt");
        assert_eq!(decrypted, message);
    }

    #[test]
    fn test_decrypt_with_wrong_key_fails() {
        let s1 = generate_secret();
        let s2 = generate_secret();
        let k1 = parse_key(&s1);
        let k2 = parse_key(&s2);

        let (iv, payload) = encrypt(&k1, b"secret data").expect("encrypt");
        let result = decrypt(&k2, &iv, &payload);
        assert!(result.is_err());
    }

    #[test]
    fn test_custom_passphrase_key_derivation() {
        let key1 = parse_key("my-custom-passphrase");
        let key2 = parse_key("my-custom-passphrase");
        assert_eq!(key1, key2);
        let (iv, payload) = encrypt(&key1, b"test custom payload").expect("encrypt");
        let decrypted = decrypt(&key2, &iv, &payload).expect("decrypt");
        assert_eq!(decrypted, b"test custom payload");
    }
}
