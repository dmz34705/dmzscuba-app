// Framework-independent reconciliation. Revisions, not device clocks, decide conflicts.
export function canonical(value, kind) {
  const ignored = new Set(['sync', 'photos', 'attachments', ...(['gear', 'setup'].includes(kind) ? ['createdAt', 'updatedAt'] : [])]);
  const clean = (input, top = false) => {
    if (Array.isArray(input)) return input.map((v) => clean(v));
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(Object.keys(input).sort().filter((key) => !top || !ignored.has(key))
      .map((key) => [key, clean(input[key])]));
  };
  return JSON.stringify(clean(value, true));
}

export async function reconcile({ local, remote, state, request, persist, apply, current, active, makeId }) {
  const keyOf = (r) => `${r.kind}/${r.id}`;
  const locals = new Map(local.map((r) => [keyOf(r), r]));
  const remotes = new Map(remote.map((r) => [keyOf(r), r]));
  const keys = new Set([...locals.keys(), ...remotes.keys(), ...Object.keys(state.records)]);
  let changed = false;
  for (const key of keys) {
    if (!active()) break;
    const [kind, id] = key.split('/');
    const base = state.records[key];
    let here = locals.get(key);
    const there = remotes.get(key);
    if (!here && !base && there?.deleted) continue;
    if (!here && base) here = { kind, id, deleted: true, data: { id } };
    const valueOf = (r) => r ? (r.deleted ? 'deleted' : `active:${canonical(r.data, kind)}`) : null;
    const value = valueOf(here);
    const dirty = !!here && (!base || value !== base.value);
    if (!dirty && (!there || there.revision === base?.revision)) continue;
    let cloud = null;
    if (there && there.revision !== base?.revision) {
      cloud = (await request(`/${key}`)).record;
      if (!active()) break;
      if (dirty && value !== valueOf(cloud) && base?.revision !== cloud.revision) {
        state.conflicts[key] = { local: here, remote: cloud };
        await persist(state);
        continue;
      }
    }
    if (!dirty || (cloud && value === valueOf(cloud))) {
      cloud = cloud || (await request(`/${key}`)).record;
      // A user edit made while the network request was running stays local for the next pass.
      if (!active() || valueOf(await current(kind, id)) !== valueOf(locals.get(key))) continue;
      await apply(cloud);
      state.records[key] = { revision: cloud.revision, value: valueOf(cloud) };
      delete state.conflicts[key]; delete state.pending[key];
      await persist(state); changed = true;
      continue;
    }
    if (state.conflicts[key]) continue;
    const previous = state.pending[key];
    const mutationId = previous?.value === value ? previous.mutationId : makeId();
    state.pending[key] = { mutationId, value };
    await persist(state); // Persist retry identity BEFORE sending: a lost response is safe to retry.
    try {
      const result = await request(`/${key}`, { method: 'PUT', body: JSON.stringify({
        baseRevision: base?.revision || 0, mutationId, deleted: !!here.deleted,
        data: Object.fromEntries(Object.entries(here.data).filter(([field]) => !['sync', 'photos', 'attachments'].includes(field))),
      }) });
      if (!active()) break;
      state.records[key] = { revision: result.record.revision, value };
      delete state.pending[key]; delete state.conflicts[key];
      await persist(state);
    } catch (error) {
      if (error.status !== 409 || !error.record) throw error;
      state.conflicts[key] = { local: here, remote: error.record };
      await persist(state);
    }
  }
  return { changed, conflicts: Object.keys(state.conflicts).length };
}
