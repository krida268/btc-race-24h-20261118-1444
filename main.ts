// Dip-Buy 240/150/100 — bot trading cbBTC/USDC, long-only, satu posisi.
//
// Bounty make.fun btc-race-24h-20261118-1444: bot balapan 24 jam di replay
// harga cbBTC/USDC (Coinbase Wrapped BTC lawan USDC), modal kertas $1.000.
// Protokol agent-fun/bars-replay/v1: hello sekali, lalu satu batch per
// bar 1 menit, lalu done; tiap batch dijawab tepat satu reply.
//
// Cara kerja, singkatnya: bot menunggu harga jatuh cukup dalam dari
// puncak 240 bar terakhir, lalu membeli seluruh cash dalam satu order.
// Posisi dilepas begitu harga pulih 100 bps di atas harga fill beli, atau
// dipotong begitu jatuh 100 bps di bawah harga fill beli. Tidak ada beli
// baru setelah bar ke-1200, dan tidak ada pembelian fallback buta: di
// window dev yang sedang turun, membeli buta di akhir window hanya
// menambah rugi.
//
// Semua keputusan hanya memakai bar yang sudah diterima lewat batch.
// Tanpa acak, tanpa jam dinding, tanpa network, tanpa baca file atau
// environment. Semua perbandingan harga memakai BigInt eksak dalam basis
// poin supaya hasil dua eksekusi identik byte demi byte.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 150;

// Parameter strategi (basis poin, 1 bp = 0,01%).
const LOOKBACK = 240; // bar untuk high rolling
const WARMUP_SEQ = 120; // bar pertama yang boleh trading
const LAST_BUY_SEQ = 1200; // sesudah bar ini: tidak ada beli baru
const DIP_BPS = 150; // beli bila close >= 150 bps di bawah high rolling
const TARGET_BPS = 100; // jual bila close >= 100 bps di atas harga fill
const STOP_BPS = 100; // jual bila close <= 100 bps di bawah harga fill
const BPS = 10000n;

// Close-close yang sudah terlihat, urut waktu, paling banyak LOOKBACK
// entri. Dipakai untuk menghitung high rolling.
const closes: bigint[] = [];

// Harga fill dari order beli yang posisinya masih dipegang (null bila
// flat, atau bila fill beli belum dilaporkan). Target dan stop-loss
// selalu diukur dari harga ini, bukan dari close saat keputusan beli.
let entryPrice: bigint | null = null;

// Client id order yang sudah dikirim tapi fill-nya belum dilaporkan di
// batch. Selama ada yang pending, order sejenis tidak dikirim lagi.
let pendingBuy: string | null = null;
let pendingSell: string | null = null;

// High tertinggi dari LOOKBACK close terakhir (termasuk bar berjalan).
function rollingHigh(): bigint {
  let high = 0n;
  for (const c of closes) {
    if (c > high) high = c;
  }
  return high;
}

// Lipat fills batch berjalan ke state strategi: catat harga fill beli,
// bersihkan pending yang sudah terjawab, dan hapus harga entry begitu
// posisi tertutup oleh fill jual.
function settleFills(batch: Batch): void {
  for (const fill of batch.fills) {
    if (fill.symbol !== SYMBOL) continue;
    if (fill.status !== 'filled') {
      if (fill.client_id === pendingBuy) pendingBuy = null;
      if (fill.client_id === pendingSell) pendingSell = null;
      continue;
    }
    if (fill.side === 'buy') {
      if (fill.client_id === pendingBuy) pendingBuy = null;
      entryPrice = BigInt(fill.price);
    } else {
      if (fill.client_id === pendingSell) pendingSell = null;
      entryPrice = null;
    }
  }
}

// Loop utama: satu keputusan per batch, paling banyak satu order per reply.
await runBars({
  onBatch(state: BarsState, batch: Batch) {
    settleFills(batch);

    // Warm-up harness: order apa pun di batch ini pasti ditolak.
    if (state.warmingUp) return [];

    const close = state.close(SYMBOL);
    if (close === null) return [];

    // Catat close bar berjalan, buang yang tertua bila sudah penuh.
    closes.push(close);
    if (closes.length > LOOKBACK) closes.shift();

    const held = state.positions.get(SYMBOL);
    const heldQty = held === undefined ? 0n : held.qty;

    // --- Keluar dari posisi: target pulih atau stop-loss. ---
    // Syarat: posisi ada, harga fill entry sudah diketahui, dan belum
    // ada order jual yang menunggu jawaban. Perbandingan eksak tanpa
    // pembulatan: target = close >= entry x 1,0100, stop = close <=
    // entry x 0,9900 (keduanya cross-multiplied dalam bps).
    if (heldQty > 0n && entryPrice !== null && pendingSell === null) {
      const hitTarget =
        close * BPS >= entryPrice * (BPS + BigInt(TARGET_BPS));
      const hitStop =
        close * BPS <= entryPrice * (BPS - BigInt(STOP_BPS));
      if (hitTarget || hitStop) {
        const sellId = `s${state.seq}`;
        pendingSell = sellId;
        return [
          {
            side: 'sell',
            symbol: SYMBOL,
            qty: heldQty,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
            client_id: sellId,
          },
        ];
      }
      return [];
    }

    // --- Masuk posisi: beli saat dip dari high rolling. ---
    // Syarat: flat, tidak ada beli pending, cash tersedia, sudah lewat
    // warm-up 120 bar, dan belum melewati batas beli bar ke-1200.
    if (
      heldQty === 0n &&
      pendingBuy === null &&
      state.cash > 0n &&
      state.seq >= WARMUP_SEQ &&
      state.seq <= LAST_BUY_SEQ
    ) {
      const high = rollingHigh();
      const deepEnough =
        high > 0n && close * BPS < high * (BPS - BigInt(DIP_BPS));
      if (deepEnough) {
        const buyId = `b${state.seq}`;
        pendingBuy = buyId;
        return [
          {
            side: 'buy',
            symbol: SYMBOL,
            notional_quote_units: state.cash,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
            client_id: buyId,
          },
        ];
      }
    }

    return [];
  },
});
