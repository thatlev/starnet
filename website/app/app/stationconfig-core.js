/* Versioned, non-credential station configuration. Shared by the viewer and runtime. */
'use strict';
const StationConfigCore = (() => {
  const choices = values => value => values.includes(value);
  const number = (min, max) => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const bool = value => typeof value === 'boolean';
  const SETTINGS = {
    theme: choices(['amber', 'green', 'blue', 'purple', 'red', 'white', 'custom']),
    themeHue: number(0, 359), themeSat: number(0, 100), themeGlow: number(0, 150),
    panelBright: number(0, 100), roomLighting: choices(['low', 'medium', 'high']),
    textScale: value => value === 0 || number(90, 150)(value),
    flicker: bool, crtGlass: choices(['full', 'dulled']), staticLevel: number(0, 200), sound: bool,
    backdrop: choices(['void', 'galaxy', 'belt', 'nursery', 'ocean', 'city', 'forest', 'moon']),
    sessionRow: choices(['compact', 'inbox']), keepComputerAwake: bool,
    notifyPrefs: value => object(value) && Object.keys(value).every(k =>
      ['runComplete', 'needsApproval', 'cronDigest', 'sound'].includes(k) && bool(value[k]))
  };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  function checkTree(value, depth = 0) {
    if (depth > 16) throw new Error('Configuration is nested too deeply');
    if (value && typeof value === 'object') for (const key of Object.keys(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsupported configuration key');
      checkTree(value[key], depth + 1);
    }
  }
  function settings(value) {
    if (!object(value)) throw new Error('settings must be an object');
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(SETTINGS, key) || !SETTINGS[key](value[key])) throw new Error('Invalid setting: ' + key);
    }
    return clone(value);
  }
  function layout(value) {
    if (!object(value) || value.schema !== 'starnet.station' || value.version !== 1) throw new Error('Expected a version 1 starnet.station layout');
    if (!object(value.rooms) || !Array.isArray(value.order) || !value.order.length || value.order.length > 128 ||
        !Array.isArray(value.props) || value.props.length > 4096) throw new Error('Invalid rooms or props');
    const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
    if (new Set(value.order).size !== value.order.length || Object.keys(value.rooms).length !== value.order.length ||
        value.order.some(k => !id(k) || !Object.hasOwn(value.rooms, k))) throw new Error('Room order must name every room exactly once');
    const coord = v => Number.isInteger(v) && Math.abs(v) <= 10000;
    let rectCount = 0, x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const k of value.order) {
      const r = value.rooms[k];
      if (!object(r) || r.id !== k || !Array.isArray(r.rects) || !r.rects.length || r.rects.length > 128) throw new Error('Invalid room: ' + k);
      rectCount += r.rects.length;
      for (const rect of r.rects) {
        if (!object(rect) || !['x1', 'y1', 'x2', 'y2'].every(c => coord(rect[c])) || rect.x2 < rect.x1 || rect.y2 < rect.y1) throw new Error('Invalid room bounds');
        x1 = Math.min(x1, rect.x1); y1 = Math.min(y1, rect.y1); x2 = Math.max(x2, rect.x2); y2 = Math.max(y2, rect.y2);
      }
    }
    if (rectCount > 1024 || x2 - x1 > 239 || y2 - y1 > 239) throw new Error('Layout exceeds the 240-tile station limit');
    if (new Set(value.props.map(p => p && p.id)).size !== value.props.length) throw new Error('Prop IDs must be unique');
    const largestId = Math.max(0, ...value.order.concat(value.props.map(p => p && p.id)).map(id => Number(/^[rp](\d+)$/.exec(id || '')?.[1]) || 0));
    if (!Number.isSafeInteger(value._nid) || value._nid <= largestId || value._nid > 1e9) throw new Error('Layout ID counter must exceed all room and prop IDs');
    for (const p of value.props) {
      if (!object(p) || !id(p.id) || typeof p.t !== 'string' || !coord(p.x) || !coord(p.y) ||
          !Number.isInteger(p.w) || !Number.isInteger(p.h) || p.w < 1 || p.h < 1 || p.w > 240 || p.h > 240) throw new Error('Invalid prop');
    }
    if (!object(value.meta) || !Object.hasOwn(value.rooms, value.meta.spawnRoomId)) throw new Error('Layout must retain a spawn room');
    if (!object(value.belts) || Object.keys(value.belts).length > 57600 || Object.entries(value.belts).some(([k, v]) =>
      !/^-?\d{1,5},-?\d{1,5}$/.test(k) || !['N', 'S', 'E', 'W'].includes(v))) throw new Error('Invalid belts');
    if (!Array.isArray(value.edges) || value.edges.length > 4096) throw new Error('Invalid pipeline edges');
    return clone(value);
  }
  function validate(value, partial = false) {
    if (!object(value) || value.starnetConfig !== 1) throw new Error('Expected starnetConfig: 1');
    if (JSON.stringify(value).length > 2 * 1024 * 1024) throw new Error('Configuration exceeds 2 MiB');
    checkTree(value);
    if (Object.keys(value).some(k => !['starnetConfig', 'settings', 'layout'].includes(k))) throw new Error('Unknown configuration section');
    const out = { starnetConfig: 1 };
    if (Object.hasOwn(value, 'settings')) out.settings = settings(value.settings);
    if (Object.hasOwn(value, 'layout')) out.layout = layout(value.layout);
    if (!partial && (!out.settings || !out.layout)) throw new Error('Configuration needs settings and layout');
    if (partial && !out.settings && !out.layout) throw new Error('No configuration changes supplied');
    return out;
  }
  function merge(before, patch) {
    const p = validate(patch, true);
    const next = clone(before);
    if (p.settings) next.settings = { ...next.settings, ...p.settings,
      notifyPrefs: { ...next.settings.notifyPrefs, ...p.settings.notifyPrefs } };
    if (p.layout) next.layout = p.layout;
    return validate(next);
  }
  function changes(before, after) {
    const out = [];
    for (const key of Object.keys(SETTINGS)) if (canonical(before.settings[key]) !== canonical(after.settings[key])) out.push('settings.' + key);
    for (const key of ['meta', 'rooms', 'order', 'props', 'belts', 'edges']) if (canonical(before.layout[key]) !== canonical(after.layout[key])) out.push('layout.' + key);
    return out;
  }
  return { validate, merge, changes, canonical, clone, settingNames: Object.keys(SETTINGS) };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = StationConfigCore;
