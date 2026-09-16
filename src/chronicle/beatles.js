// ─────────────────────────────────────────────────────────────
// The Beatles in the studio, 1962 → 1970.
//
// Told through the tape, because the tape is the story. They start on a
// two-track machine, where a mistake means playing the whole song again;
// four-track arrives in late 1963 and lets them put a voice on after the
// band; eight-track arrives in 1968 and the records stop sounding like
// four people in a room. Seven years, and the width of the tape is doing
// a lot of the work.
//
// Each session shows the day, what was being cut, the machine it went to,
// and who played what — which is where most of the surprises are.
// ─────────────────────────────────────────────────────────────

import { clamp, css, lerp, TAU } from '../util.js';

const J = 'John', P = 'Paul', G = 'George', R = 'Ringo';
const WHO = [J, P, G, R];
const WHO_COL = [[352, 54, 56], [204, 48, 54], [46, 56, 52], [130, 40, 48]];

// [decimal year, date, song, studio, tracks, [[who, instrument], …], note]
const SESSIONS = [
  [1962.43, '1962年6月6日', 'Besame Mucho / Love Me Do', 'EMI Studio Two', 2,
   [[J, 'リズムギター、ハーモニカ'], [P, 'ベース、ボーカル'], [G, 'リードギター'], ['Pete Best', 'ドラム']],
   'アーティスト・テスト。プロデューサーのジョージ・マーティンはドラムだけ気に入らなかった'],
  [1962.68, '1962年9月4日', 'Love Me Do', 'EMI Studio Two', 2,
   [[J, 'ハーモニカ'], [P, 'ボーカル'], [G, 'アコースティック'], [R, 'ドラム']],
   'リンゴが初めて叩く。十五テイク'],
  [1962.70, '1962年9月11日', 'Love Me Do', 'EMI Studio Two', 2,
   [[J, 'ハーモニカ'], [P, 'ボーカル'], [G, 'アコースティック'], [R, 'タンバリン']],
   'マーティンはセッション・ドラマーを呼んだ。リンゴはタンバリンに回された'],
  [1963.11, '1963年2月11日', '『Please Please Me』全10曲', 'EMI Studio Two', 2,
   [[J, 'ボーカル、ギター'], [P, 'ベース'], [G, 'ギター'], [R, 'ドラム']],
   '一日、約十時間でアルバムを録る。最後に録った Twist and Shout は、声が潰れる直前の一発録り'],
  [1963.79, '1963年10月17日', 'I Want to Hold Your Hand', 'EMI Studio Two', 4,
   [[J, 'ギター、ボーカル'], [P, 'ベース、ボーカル'], [G, 'ギター'], [R, 'ドラム']],
   'アビイ・ロードに四トラック機が入る。演奏を録ってから歌を重ねられるようになった'],
  [1964.13, '1964年2月25日', 'And I Love Her', 'EMI Studio Two', 4,
   [[J, 'アコースティック'], [P, 'ボーカル'], [G, 'ガット弦ギター'], [R, 'ボンゴ']],
   'リンゴがドラムを置いてボンゴとクラベスに回る'],
  [1964.32, '1964年4月16日', 'A Hard Day’s Night', 'EMI Studio Two', 4,
   [[J, 'ボーカル、アコースティック'], [P, 'ベース'], [G, '十二弦リッケンバッカー'], [R, 'ドラム']],
   'あの冒頭の一撃。十二弦ギターとピアノとベースが同時に鳴っている'],
  [1965.13, '1965年2月15日', 'Ticket to Ride', 'EMI Studio Two', 4,
   [[J, 'ボーカル、十二弦'], [P, 'ベース、リードギター'], [G, 'ギター'], [R, 'ドラム']],
   'あのリフを弾いているのはポール。リンゴのドラムパターンもポールの案だった'],
  [1965.45, '1965年6月14日', 'Yesterday', 'EMI Studio Two', 4,
   [[P, 'ボーカル、アコースティック']],
   'ポール一人。ビートルズの録音で他の三人が誰も参加していない最初の曲。弦楽四重奏は三日後に重ねられた'],
  [1965.78, '1965年10月12日', 'Norwegian Wood', 'EMI Studio Two', 4,
   [[J, 'ボーカル、アコースティック'], [P, 'ベース'], [G, 'シタール'], [R, 'タンバリン']],
   'ポピュラー音楽のレコードでシタールが鳴った最初の一枚'],
  [1966.26, '1966年4月6日', 'Tomorrow Never Knows', 'EMI Studio Three', 4,
   [[J, 'ボーカル'], [P, 'ベース、テープループ'], [G, 'タンブーラ'], [R, 'ドラム']],
   'ジョンの声をレスリー・スピーカーに通す。同じ週にADT（自動二重録音）が発明された'],
  [1966.32, '1966年4月14日', 'Paperback Writer', 'EMI Studio Three', 4,
   [[J, 'コーラス'], [P, 'ボーカル、ベース'], [G, 'リードギター'], [R, 'ドラム']],
   'ベースを大きく録るために、スピーカーをマイク代わりに使った'],
  [1966.90, '1966年11月24日', 'Strawberry Fields Forever', 'EMI Studio Two', 4,
   [[J, 'ボーカル、メロトロン'], [P, 'ベース、メロトロン'], [G, 'スワルマンダル'], [R, 'ドラム']],
   '速さも調も違う二つのテイクを、テープの回転数を変えてつなぎ合わせた'],
  [1967.11, '1967年2月10日', 'A Day in the Life', 'EMI Studio One', 4,
   [[J, 'ボーカル'], [P, 'ベース、ボーカル'], [G, 'マラカス'], [R, 'ドラム']],
   '四十人の管弦楽団に「一番低い音から一番高い音まで、他人を聞かずに上がれ」と指示した'],
  [1967.12, '1967年2月22日', 'A Day in the Life の最後の和音', 'EMI Studio Two', 4,
   [[J, 'ピアノ'], [P, 'ピアノ'], [G, 'ピアノ'], [R, 'ピアノ']],
   '三台のピアノとハーモニウムを同時に叩き、音が消えるまで四十秒間録り続けた'],
  [1967.48, '1967年6月25日', 'All You Need Is Love', 'EMI Studio One', 4,
   [[J, 'ボーカル'], [P, 'ベース'], [G, 'リードギター'], [R, 'ドラム']],
   '衛星生中継。二十六か国、推定四億人が見ている前で録音した'],
  [1968.42, '1968年6月4日', 'Revolution 1', 'EMI Studio Three', 4,
   [[J, 'ボーカル、アコースティック'], [P, 'ベース、オルガン'], [G, 'リードギター'], [R, 'ドラム']],
   '十八分のテイクを録り、後半をつないで Revolution 9 にした'],
  [1968.58, '1968年7月31日', 'Hey Jude', 'Trident Studios', 8,
   [[J, 'アコースティック、コーラス'], [P, 'ボーカル、ピアノ'], [G, 'リードギター'], [R, 'ドラム']],
   '八トラック機を使うため他社のスタジオへ。七分十一秒、当時としては長すぎるシングル'],
  [1968.63, '1968年8月22日', 'Back in the U.S.S.R.', 'EMI Studio Two', 8,
   [[J, 'ベース、ギター'], [P, 'ボーカル、ドラム'], [G, 'ベース、ギター'], ['—', '']],
   'リンゴが脱退を告げて出て行き、ドラムはポールが叩いた。二週間後に彼は花で飾られたドラムセットに戻る'],
  [1968.68, '1968年9月6日', 'While My Guitar Gently Weeps', 'EMI Studio Two', 8,
   [[J, 'ギター'], [P, 'ベース、ピアノ'], [G, 'ボーカル、アコースティック'], [R, 'ドラム']],
   'ジョージが友人のエリック・クラプトンを連れてきてリードを弾かせた。険悪な空気が一日だけ収まった'],
  [1969.08, '1969年1月30日', 'ルーフトップ・コンサート', 'Apple, Savile Row 屋上', 8,
   [[J, 'ボーカル、ギター'], [P, 'ボーカル、ベース'], [G, 'ギター'], [R, 'ドラム']],
   '四十二分で警察に止められる。四人が人前で演奏した最後'],
  [1969.55, '1969年7月21日', 'Here Comes the Sun', 'EMI Studio Two', 8,
   [[P, 'ベース、コーラス'], [G, 'ボーカル、アコースティック、モーグ'], [R, 'ドラム']],
   'ジョンは交通事故で不在。モーグ・シンセサイザーが初めて使われたアルバムになる'],
  [1969.60, '1969年8月8日', 'アビイ・ロードの横断歩道', 'Abbey Road, NW8', 8,
   [[J, ''], [P, ''], [G, ''], [R, '']],
   '撮影は十分、六枚だけ。ポールは暑くて裸足だった'],
  [1969.63, '1969年8月20日', '『Abbey Road』最終編集', 'EMI Studio Two', 8,
   [[J, ''], [P, ''], [G, ''], [R, '']],
   '四人が同じスタジオにそろった最後の日'],
  [1970.01, '1970年1月3日', 'I Me Mine', 'EMI Studio Two', 8,
   [[P, 'ベース、ピアノ'], [G, 'ボーカル、ギター'], [R, 'ドラム']],
   'ビートルズとして録音された最後の新曲。ジョンはすでに脱退を告げていた'],
  [1970.27, '1970年4月10日', '解散', 'ロンドン', 8,
   [[P, '']],
   'ポールが脱退を発表する。八年で二百十三曲を残した']
];

export const topic = {
  id: 'beatles',
  title: 'ビートルズの録音',
  subtitle: '1962 → 1970',
  palette: {
    bg: [28, 18, 8], ink: [38, 14, 88], ghost: [30, 12, 20],
    tape: [26, 26, 26], reel: [32, 22, 38], head: [40, 70, 58]
  },

  events() {
    return SESSIONS.map(([t, date, song, studio, tracks, band, note], i) => ({
      t, i, date, song, studio, tracks, band,
      label: note
    }));
  },

  focus(g) {
    const { w, h } = g;
    const S = w / 2.15;
    // the deck sits below the caption, not behind it
    return { x: 0, y: 0.02 + (h / 2 - h * 0.63) / S, S };
  },

  backdrop(g) {
    const { ctx, w, h, pal } = g;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, css(pal.bg, 1, 2));
    bg.addColorStop(1, css(pal.bg, 1, -3));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  },

  draw(g) {
    const { ctx, pal } = g;
    const e = g.event;
    const spin = g.reduced ? 0 : g.time * 1.9;

    // two reels, turning
    const reel = (cx, full) => {
      ctx.save();
      ctx.translate(cx, -0.62);
      ctx.fillStyle = css(pal.reel, 1);
      ctx.beginPath(); ctx.arc(0, 0, 0.255, 0, TAU); ctx.fill();
      ctx.fillStyle = css(pal.tape, 1);
      ctx.beginPath(); ctx.arc(0, 0, 0.11 + 0.135 * full, 0, TAU); ctx.fill();
      ctx.rotate(spin * (full > 0.5 ? 1 : 1.6));
      ctx.strokeStyle = css(pal.ink, 0.3);
      ctx.lineWidth = g.px(2);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 0.055, Math.sin(a) * 0.055);
        ctx.lineTo(Math.cos(a) * 0.115, Math.sin(a) * 0.115);
        ctx.stroke();
      }
      ctx.fillStyle = css(pal.ink, 0.5);
      ctx.beginPath(); ctx.arc(0, 0, 0.04, 0, TAU); ctx.fill();
      ctx.restore();
    };
    const runs = (g.travel + g.index) % 1;
    reel(-0.47, 1 - runs * 0.5);
    reel(0.47, 0.5 + runs * 0.5);

    // the tape between them, running past the head
    ctx.strokeStyle = css(pal.tape, 1);
    ctx.lineWidth = g.px(11);
    ctx.beginPath();
    ctx.moveTo(-0.47, -0.62 + 0.255);
    ctx.lineTo(-0.27, -0.30);
    ctx.lineTo(0.27, -0.30);
    ctx.lineTo(0.47, -0.62 + 0.255);
    ctx.stroke();
    ctx.fillStyle = css(pal.head, 0.9);
    ctx.fillRect(-0.035, -0.335, 0.07, 0.07);

    // the track sheet: one lane per track the machine has
    const n = e.tracks;
    const top = -0.16, laneH = 0.115, wide = 0.92;
    for (let i = 0; i < n; i++) {
      const y = top + i * laneH;
      ctx.fillStyle = css(pal.ghost, 0.85);
      ctx.fillRect(-wide / 2, y, wide, laneH * 0.82);
      ctx.strokeStyle = css(pal.ink, 0.1);
      ctx.lineWidth = g.px(1);
      ctx.strokeRect(-wide / 2, y, wide, laneH * 0.82);
    }
    // who is on the tape, laid into the lanes
    const band = e.band.filter((b) => b[0] !== '—');
    for (let i = 0; i < band.length && i < n; i++) {
      const y = top + i * laneH;
      const idx = WHO.indexOf(band[i][0]);
      const col = idx >= 0 ? WHO_COL[idx] : [40, 20, 46];
      const fill = clamp((g.since - i * 0.06) * 3.4);
      if (fill <= 0) continue;
      ctx.fillStyle = css(col, 0.5);
      ctx.fillRect(-wide / 2, y, wide * fill, laneH * 0.82);
      ctx.fillStyle = css(col, 0.95, 16);
      ctx.fillRect(-wide / 2, y, g.px(3), laneH * 0.82);
    }
  },

  /** The date, the song, the machine, and who played what. */
  overlay(g) {
    const { ctx, pal, w, h } = g;
    const e = g.event;
    const live = clamp(1 - g.travel * 1.4);
    const small = Math.max(11, Math.round(Math.min(w, h) * 0.027));
    const mid = Math.max(13, Math.round(Math.min(w, h) * 0.034));

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // the machine, written on the tape deck
    ctx.font = `500 ${small}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillStyle = css(pal.ink, 0.5);
    const deck = g.screen(0, -0.30);
    ctx.fillText(`${e.tracks}-TRACK　${e.studio}`, deck.x, deck.y - small * 2.4);

    // the song
    ctx.font = `600 ${mid}px Inter, system-ui, "Hiragino Sans", sans-serif`;
    ctx.fillStyle = css(pal.ink, 0.5 + live * 0.48);
    const song = g.screen(0, -0.22);
    ctx.fillText(e.song, song.x, song.y + mid * 0.4);

    // who played what, one line per lane
    ctx.textAlign = 'left';
    ctx.font = `400 ${small}px Inter, system-ui, "Hiragino Sans", sans-serif`;
    const band = e.band.filter((b) => b[0] !== '—');
    for (let i = 0; i < band.length && i < e.tracks; i++) {
      const p = g.screen(-0.44, -0.16 + i * 0.115 + 0.047);
      const idx = WHO.indexOf(band[i][0]);
      const col = idx >= 0 ? WHO_COL[idx] : [40, 16, 70];
      ctx.fillStyle = css(col, 0.95, 30);
      ctx.fillText(band[i][0], p.x + 8, p.y);
      ctx.fillStyle = css(pal.ink, 0.72);
      ctx.fillText(band[i][1], p.x + 8 + ctx.measureText(band[i][0]).width + 10, p.y);
    }
  },

  /** The day it happened, which is the thing worth knowing here. */
  stamp: (y, clock) => (clock && clock.event && clock.travel < 0.4
    ? clock.event.date.replace(/年|月/g, '.').replace('日', '')
    : String(Math.floor(y)))
};
