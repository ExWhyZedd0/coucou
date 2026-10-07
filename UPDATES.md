# Ringkasan Pembaruan Coucou (Windows / Tauri v2)

Dokumen ini mencatat seluruh fitur baru, perbaikan arsitektur, dan optimasi performa yang telah diimplementasikan dari basis kode awal (*base code*) Coucou.

---

## 1. Integrasi Penuh Google Antigravity & Subagent Tracking
*Basis kode awal hanya memiliki integrasi minimal berbasis Claude Code dan nama hook Prancis.*

* **Relay Script Khusus Antigravity (`coucou-relay.py`)**:
  * Menjembatani event siklus hidup Antigravity ke named pipe Coucou (`\\.\pipe\coucou-hook`).
  * Menerjemahkan nama tool dan ringkasan aksi (`toolAction`, `toolSummary`) menjadi label UI yang jelas (`Running tests`, `Analyzing directory`, `Subagent · Coder`, `Edit · file.ts`).
  * **Pelacakan Multi-Subagent Berbasis Waktu**: Melacak jumlah subagent aktif secara persisten (`coucou-subagents.json`). Mencegah Coucou mengumumkan tugas selesai secara prematur ketika subagent latar belakang masih mengeksekusi tugas.
* **Pill Antigravity Permanen**:
  * Menambahkan pill tugas permanen `agent_antigravity` dengan warna khas `#E879F9`.
  * Status tugas tidak hilang saat idle, melainkan kembali ke status siap (*idle*).
* **Fokus Otomatis IDE Antigravity**:
  * Menggunakan Win32 API (`EnumWindows`, `SetForegroundWindow`) untuk mendeteksi jendela Antigravity dan membawanya ke latar depan saat pengguna mengklik pill atau tombol terminal.

---

## 2. Dukungan Local LLM (Ollama, LM Studio, Unsloth, Custom API)
*Basis kode awal hanya mendukung Claude API resmi Anthropic di macOS/Windows.*

* **Backend Rust Kustom (`windows/src-tauri/src/local_chat.rs`)**:
  * Mendukung endpoint `/v1/chat/completions` dan `/v1/models` yang kompatibel dengan OpenAI.
  * Fitur penyaring tag pemikiran (*think tags*): Otomatis membersihkan tag `<think>...</think>` (pada model penalaran seperti DeepSeek-R1) agar tidak mengotori balon percakapan pengguna.
* **Pengaturan Local LLM di UI (`windows/src/settings/main.ts`)**:
  * Pilihan profil instan: Ollama (`http://localhost:11434`), LM Studio (`http://localhost:1234`), Unsloth (`http://localhost:8000`), dan Custom endpoint.
  * Tombol deteksi model otomatis (*Fetch Models*) dengan indikator status koneksi langsung.
* **Integrasi Obrolan**:
  * Pengalihan provider di pengaturan (`chatProvider: "local" | "claude"`).

---

## 3. Sistem Suara & STT Lokal Berkecepatan Tinggi (Whisper GPU)
*Basis kode awal tidak memiliki dukungan input suara lokal yang andal di Windows, sering terputus atau gagal membaca bahasa Indonesia.*

* **Daemon Persistent Whisper (`whisper_server.py` & `whisper_server.rs`)**:
  * Menjalankan Python worker persisten di latar belakang yang memuat model `large-v3-turbo` ke dalam VRAM GPU (fp16 pada ROCm AMD / CUDA).
  * Menghilangkan waktu pemuatan model setiap kali berbicara: transkripsi selesai dalam 1-2 detik.
* **Normalisasi Puncak Universal (Universal Peak Normalization)**:
  * Mengubah audio PCM menjadi WAV 16kHz mono 16-bit secara dinamis dengan puncak terstandarisasi 0.85. Mencegah distorsi dan *clipping* bahkan pada amplifikasi mic tinggi.
* **Software Gain / Microphone Boost (Hingga 10.0x)**:
  * Menambahkan node penguat sinyal digital (`GainNode`) di Web Audio API dan menonaktifkan AGC bawaan peramban agar suara pelan tetap terdengar jelas.
* **Alat Uji & Pemilih Mikrofon (Test Mic & Device Selector)**:
  * Pengguna dapat memilih perangkat input mikrofon spesifik.
  * Meteran volume interaktif *real-time* di tab Settings untuk memeriksa sensitivitas dan status mikrofon.
* **Auto-Typing Obrolan Langsung**:
  * Mengetik otomatis secara real-time saat pengguna berbicara, dengan jeda senyap (VAD) untuk pengiriman otomatis.

---

## 4. Deteksi Wake Word Lokal & Always-On
*SAPI Windows tidak memiliki model akustik bahasa Indonesia dan sering gagal mendeteksi panggilan suara.*

* **Engine Wake Word Lokal (`windows/src/core/wake.ts`)**:
  * Gate energi audio berkelanjutan (VAD berbasis RMS) yang memotong paket audio pendek saat terdeteksi suara manusia.
  * Audio dikirim ke server Whisper lokal untuk pengenalan kata kunci.
  * Pencocokan fonetik fleksibel (*fuzzy matching*) untuk panggilan seperti "Hey Coucou", "coucou", "kuku", "mochi", dan kata kustom pengguna.

---

## 5. Text-to-Speech (TTS) Edge Neural & Kontrol Suara
*TTS bawaan Windows SAPI terdengar kaku dan robotik, serta sempat mengalami crash pada nilai volume negatif.*

* **Microsoft Edge Neural TTS (`windows/src-tauri/src/tts.rs`)**:
  * Menghasilkan suara alami berstandar Google Assistant/Edge AI (contoh: `id-ID-GadisNeural`, `id-ID-ArdiNeural`, `en-US-JennyNeural`).
  * Perbaikan penanganan argumen CLI: Menggunakan format `--volume=-90%` dan berkas sementara (`--file`) guna mencegah kegagalan *escaping* karakter.
  * Fallback otomatis ke Windows SAPI jika koneksi internet terputus.
* **Mode Ringkas Cepat (Concise Mode)**:
  * Sanitasi teks (menghapus format kode markdown tebal/miring, tautan, dan tabel sebelum dibaca).
  * Opsi pembacaan ringkas 1-2 kalimat pertama untuk mempercepat sintesis suara menjadi di bawah 1 detik.
* **Kontrol Kecepatan dan Volume**:
  * Penggeser kecepatan bicara (0.8x hingga 1.5x) dan volume di tab Pengaturan dengan tombol pratinjau instan.

---

## 6. Akses Web & Pencarian DuckDuckGo Lite
*Sistem tidak memiliki akses web mandiri atau bergantung pada scraping Bing yang rentan gagal membaca struktur halaman.*

* **Backend Web Access (`windows/src-tauri/src/web_access.rs`)**:
  * Pencarian web memanfaatkan antarmuka ringan DuckDuckGo Lite yang stabil dan bebas blokir javascript.
  * Parser regex tangguh untuk mengekstrak judul, URL asli, dan cuplikan (*snippet*) berita/informasi terkini.
  * Pengambil konten halaman web (*web fetcher*) yang otomatis membersihkan tag HTML, script, dan css sebelum dikirim ke LLM.
* **Grounding Konteks Otomatis**:
  * Ikon bola dunia (*globe*) di samping kotak chat untuk mengaktifkan/menonaktifkan pencarian web secara instan.
  * Hasil pencarian disuntikkan secara otomatis sebagai konteks grounding tanggal dan fakta terkini ke dalam prompt LLM.

---

## 7. Peluncur Aplikasi Lokal (Intent Detection)
*Coucou sebelumnya tidak dapat membuka aplikasi lokal atas permintaan pengguna.*

* **Command Eksekusi Shell (`open_app` di `windows/src-tauri/src/lib.rs`)**:
  * Menggunakan perintah Windows ShellExecute (`cmd /C start "" "<nama_aplikasi>"`) untuk membuka aplikasi sistem, URI, atau file.
* **Pendeteksi Intent Cepat di Frontend (`windows/src/views/chat.ts`)**:
  * Menganalisis input pengguna secara lokal jika mengandung kata kunci seperti "buka", "open", "launch", atau "tolong buka" (contoh: *"buka spotify"*, *"tolong buka notepad"*).
  * Langsung meluncurkan aplikasi tanpa perlu menunggu inferensi LLM, lalu Coucou merespons secara lisan dan tertulis bahwa aplikasi telah dibuka.

---

## 8. Peningkatan Tampilan & Antarmuka Island
* Pulau Compact Selalu Aktif (*Always-On Compact Mode*): Opsi `alwaysShowCompact` agar Coucou tetap terlihat dalam mode mungil (*petit*) di tepi atas layar tanpa bersembunyi sepenuhnya saat idle.
* Pembersihan Kartu Pengaturan: Menyembunyikan titik merah pada integrasi yang tidak dipakai, dan hanya menampilkan badge hijau pada layanan yang aktif terkonfigurasi (Antigravity, Local LLM, Claude).
* Indikator status dinamis: Status interaktif pada kotak masukan saat merekam ("Listening…"), memproses suara ("Transcribing voice…"), atau mencari web ("Searching the web…").

---

## Daftar Berkas yang Dimodifikasi & Ditambahkan

| Kategori | Berkas | Peran Utama |
|---|---|---|
| **Antigravity Relay** | `~/.gemini/config/coucou-relay.py` | Relay hook, pelacakan subagent, pemformatan tool action |
| **STT Whisper** | `windows/src-tauri/src/whisper_server.py` | Worker Python lokal Whisper GPU persisten |
| | `windows/src-tauri/src/whisper_server.rs` | Pengelola proses worker & komunikasi IPC |
| | `windows/src-tauri/src/stt.rs` | Router STT (Local Whisper vs Windows Native) |
| **TTS Engine** | `windows/src-tauri/src/tts.rs` | Integrasi Edge Neural TTS & fallback SAPI |
| **Wake Word** | `windows/src/core/wake.ts` | Deteksi energi suara (VAD) & pencocokan kata bangun |
| | `windows/src-tauri/src/voice_wake.rs` | Listener wake word Windows SAPI sekunder |
| **Local LLM** | `windows/src-tauri/src/local_chat.rs` | Klien HTTP OpenAI-compatible & filter tag think |
| **Web Access** | `windows/src-tauri/src/web_access.rs` | DuckDuckGo Lite search parser & pembersih web |
| **App Launcher** | `windows/src-tauri/src/lib.rs` | Tauri command `open_app` |
| | `windows/src/views/chat.ts` | Intent parser "buka <app>" & integrasi web search |
| **Audio Core** | `windows/src/core/voice.ts` | Normalisasi audio peak, pre-amp GainNode, auto-typing |
| **Pengaturan & UI** | `windows/src/settings/main.ts` | UI Mic Boost, Test Mic, Local LLM, Voice Controls |
| | `windows/src/views/views.ts` | Pembersihan kartu pengaturan & label dinamis agen |
| | `windows/src/core/bridge.ts` | Binding IPC frontend-backend untuk semua fitur baru |
| | `windows/src/core/state.ts` | State skema pengaturan dan status audio/web |
