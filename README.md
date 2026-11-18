# Dip-Buy 240/150/100 — bot trading cbBTC/USDC

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/krida268/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/krida268/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Bot mean-reversion untuk bounty [btc-race-24h-20261118-1444](https://make.fun/bounty/btc-race-24h-20261118-1444): trading Coinbase Wrapped BTC (cbBTC) lawan USDC, menit demi menit, dengan uang kertas $1.000, protokol agent-fun/bars-replay/v1.

## Strategi

Long only, satu posisi, all-in. Harga dalam skala integer 1e5, semua
perbandingan memakai BigInt eksak (basis poin) supaya deterministik.

- **High 240 bar:** H240 = close tertinggi dari 240 bar terakhir (atau
  semua bar yang sudah terlihat bila kurang dari 240). Trading mulai di
  bar ke-120; 120 bar pertama hanya membentuk referensi.
- **Entry (beli):** saat flat dan close bar berjalan >= 150 bps di bawah
  H240, beli seluruh cash dalam 1 order. Fill terjadi di open bar
  berikutnya. Tidak ada beli baru setelah bar ke-1200.
- **Exit target:** saat punya posisi dan close >= 100 bps di atas harga
  fill beli, jual seluruh posisi.
- **Stop-loss:** saat punya posisi dan close <= 100 bps di bawah harga
  fill beli, jual seluruh posisi.
- **Harga fill entry** dibaca dari `batch.fills` (field `price`) pada batch
  setelah order beli dikirim — bukan harga close saat keputusan beli.
  Posisi hanya di-exit setelah harga fill ini diketahui.
- **Tanpa fallback:** tidak ada pembelian buta di akhir window. Di window
  dev yang sedang turun, membeli buta di bar akhir hanya menambah rugi.
- `max_slippage_bps = 150` untuk semua order. Tidak ada order saat
  `state.warmingUp`. Satu order per reply.

## Cara menjalankan (grade lokal)

```sh
node cli/makefun.mjs grade-local --kit . --bot <repo-ini> --driver process --worktree
```

dijalankan dari direktori kit `btc-race-24h-20261118-1444-kit`. Bot
dijalankan harness sebagai `node main.ts` (Node 22, erasable TypeScript,
tanpa dependensi di luar standard library; shim protokol di-vendor di
`vendor/makefun-bars.ts`).

## Catatan

- Dev window bounty ini sedang turun ($65.083 → $63.261), jadi
  buy-and-hold dan strategi momentum merugi; bot ini hanya masuk saat
  ada pantulan (dip dari high rolling) dan keluar cepat di target atau
  stop-loss 100 bps.
- Bot deterministik: tanpa acak, tanpa jam dinding, tanpa network, tanpa
  baca file atau environment. Dua eksekusi grade-local harus memberi log
  aksi yang identik.

## Referral

Daftar make.fun lewat referral saya: https://make.fun/r/enzt809f (kode `enzt809f`).
