/* Pure three-way merge. Collections have stable IDs; deletion is a change. */
(function(root) {
  'use strict';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function merge(base, local, remote, path = 'trips') {
    if (same(local, remote) || same(base, remote)) return local;
    if (same(base, local)) return remote;
    const collection = [base, local, remote].every(Array.isArray) &&
      path.split('.').some(x => ['trips', 'expenses'].includes(x)) &&
      [...base, ...local, ...remote].every(x => x && typeof x.id === 'string');
    if (collection) {
      const maps = [base, local, remote].map(xs => new Map(xs.map(x => [x.id, x])));
      return [...new Set([...remote, ...local, ...base].map(x => x.id))].flatMap(id => {
        const value = merge(...maps.map(m => m.get(id)), `${path}.${id}`);
        return value === undefined ? [] : [value];
      });
    }
    if ([base, local, remote].every(x => x && typeof x === 'object' && !Array.isArray(x))) {
      const result = {};
      for (const k of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
        const value = merge(base[k], local[k], remote[k], `${path}.${k}`);
        if (value !== undefined) result[k] = value;
      }
      return result;
    }
    throw new Error(`同步衝突：${path}。本機資料已保留，請先備份後選擇要保留的版本。`);
  }
  root.LedgerMerge = merge;
})(typeof window === 'undefined' ? globalThis : window);
