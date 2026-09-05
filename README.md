# Eyesic

Pemutar musik pribadi bertenaga YouTube. Gratis, tanpa database, tanpa server yang perlu dirawat.

## Cara kerjanya

```
Browser (PWA)
 ├── UI + koleksi   → localStorage, murni di perangkat kamu
 ├── Playback       → YouTube IFrame Player (disembunyikan, diambil audionya)
 └── Pencarian      → /api/search → YouTube Data API v3 (API key aman di server)
```

Tidak ada database, tidak ada akun, tidak ada ekstraksi stream. Playback memakai
player resmi YouTube, jadi tidak ada yang bisa rusak sendiri saat YouTube berubah.

## Setup

### 1. Ambil API key YouTube (gratis, tanpa kartu kredit)

1. Buka [Google Cloud Console](https://console.cloud.google.com/), bikin project baru.
2. **APIs & Services → Library** → cari **YouTube Data API v3** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Klik key-nya → **API restrictions → Restrict key** → centang YouTube Data API v3.

### 2. Jalankan

```bash
cp .env.example .env.local   # lalu isi YOUTUBE_API_KEY
pnpm install
pnpm dev
```

### 3. Deploy (Vercel, free tier)

```bash
npx vercel
```

Tambahkan environment variable `YOUTUBE_API_KEY` di dashboard Vercel, lalu deploy
ulang. Buka situsnya di HP → **Add to Home Screen** untuk memasang PWA-nya.

## Kuota API

Jatah harian YouTube Data API adalah **10.000 unit**, reset tiap tengah malam
Pacific Time (sekitar jam 15:00 WIB).

| Aksi                       | Biaya      | Per hari    |
| -------------------------- | ---------- | ----------- |
| Pencarian teks             | 101 unit   | ~99×        |
| Tempel link video          | 1 unit     | ~10.000×    |
| Impor playlist (50 lagu)   | 2 unit     | ~5.000×     |

Karena itu pencarian hanya dikirim saat kamu menekan Enter, bukan tiap ketikan,
dan hasilnya di-cache berlapis:

- **Server** — hasil pencarian disimpan 30 hari (judul, artis, dan durasi lagu
  tidak berubah). Impor playlist sengaja **tidak** di-cache sama sekali: sekali
  impor cuma sekitar 2 unit, dan lagu yang baru kamu tambahkan di YouTube harus
  langsung ikut terbawa saat impor ulang.
- **Browser** — pencarian yang sama tidak pernah dibayar dua kali, dan cache-nya
  bertahan walau tab ditutup. Cache dibatasi 120 entri dan selalu mengalah
  kalau penyimpanan penuh, supaya koleksi kamu tidak pernah gagal disimpan.

## Yang perlu diketahui

- **Audio berhenti kalau layar HP dikunci.** Ini konsekuensi memakai IFrame
  player YouTube. Kontrol lockscreen dan pemutaran background butuh ekstraksi
  stream audio, yang rutin diblokir YouTube dan perlu perawatan terus-menerus.
  Trade-off ini dipilih sadar demi "zero maintenance".
- **Kadang muncul iklan**, karena ini player resmi YouTube.
- **Video yang tidak boleh di-embed dilewati otomatis.** Pencarian sudah
  memfilter `videoEmbeddable=true`, dan kalau tetap gagal, lagu berikutnya
  langsung diputar.
- **Koleksi tersimpan di browser saja.** Ada tombol backup/restore JSON di
  halaman Koleksi. Hapus data situs = koleksi hilang.

## Struktur

| Path                              | Isi                                            |
| --------------------------------- | ---------------------------------------------- |
| `app/api/search/route.ts`         | Proxy pencarian, memegang API key              |
| `app/api/playlist/route.ts`       | Impor playlist YouTube                         |
| `components/player/player-provider.tsx` | Mesin playback: antrian, shuffle, repeat |
| `components/player/player-bar.tsx`| Player mengambang dengan piringan hitam        |
| `lib/library.ts`                  | Koleksi di localStorage                        |
| `lib/youtube-api.ts`              | Klien YouTube Data API (server-only)           |
| `scripts/generate-icons.mjs`      | Bikin ulang ikon PWA dari `public/logo.jpg`    |

Ganti nama aplikasi di `lib/config.ts`.
