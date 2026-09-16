// ─────────────────────────────────────────────────────────────
// The shape of an entry.
//
//   [西暦, 経度, 緯度, 見出し, 地域, 説明]
//
// 西暦 is negative for BC, and may be a very large negative number for
// prehistory. 経度/緯度 is the actual place — the pass, the harbour, the
// room. 地域 is what to call that place on the map, in the words a person
// would use to say where it is. 説明 is the part worth reading: what
// happened, why it happened there, and what it changed. Two or three
// sentences, because a person has half a minute to read it and nothing
// else to do.
//
// Events for a war fought abroad are placed where the fighting was, when
// that is near enough to show on the same map; when it is not, they are
// placed at the port or the palace the thing was ordered from, and the
// text says where it actually happened.
// ─────────────────────────────────────────────────────────────

export const C = (code, ja, en, blurb, rows) => ({
  code, ja, en, blurb,
  events: rows.map(([t, lon, lat, title, place, text], i) =>
    ({ t, i, lon, lat, title, place, text }))
});
