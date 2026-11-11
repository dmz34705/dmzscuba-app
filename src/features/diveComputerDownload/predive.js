// Turns the native pre-dive setup result ({ gas, clock }) into what the diver
// needs to read. Pure JS — verified by scripts/verify-nitrox-analyzer.cjs.

export function gasPercent(o2) {
  const n = Math.round(Number(o2));
  return Number.isFinite(n) ? n : null;
}

/** What the "send" step will do, before anything is sent. */
export function predivePlan(connectedDevice, o2) {
  const pct = gasPercent(o2);
  const gas = connectedDevice?.gasSyncSupported === true;
  const clock = connectedDevice?.timeSyncSupported === true;
  return {
    gas,
    clock,
    canSend: gas || clock,
    label: gas && clock ? `Send ${pct}% + set clock` : gas ? `Send ${pct}% to computer` : clock ? 'Set computer clock' : null,
    note: gas
      ? `Sets the computer's first gas to ${pct}% O₂ and checks it was saved.`
      : `This computer doesn't let apps change its gases — you'll set ${pct}% on the computer itself.${clock ? ' The app can still set its clock.' : ''}`,
  };
}

/** Lines to show after the setup ran. */
export function describePredive(result, o2) {
  const pct = gasPercent(o2);
  const lines = [];
  const gas = result?.gas || {};
  const clock = result?.clock || {};

  if (gas.status === 'set' && gas.unchanged) {
    lines.push({ tone: 'good', text: `✓ The computer is set to ${pct}% O₂ (checked by reading it back).` });
  } else if (gas.status === 'set') {
    const prev = gas.previous && Number.isFinite(gas.previous.o2) ? ` (was ${gas.previous.o2}%)` : '';
    lines.push({ tone: 'good', text: `✓ Gas ${gas.slot || 1} set to ${pct}% O₂${prev} and verified.` });
  } else if (gas.status === 'pending') {
    lines.push({ tone: 'warning', text: gas.message || `Sent ${pct}%. Check the computer shows ${pct}% after it restarts.` });
  } else if (gas.status === 'error') {
    lines.push({ tone: 'danger', text: `${gas.message || 'The gas could not be set.'}` });
  } else if (gas.status === 'unsupported' || gas.status === 'skipped') {
    lines.push({ tone: 'warning', text: `Set ${pct}% on the computer by hand — it doesn't accept gases from apps.` });
  }

  if (clock.status === 'set') lines.push({ tone: 'good', text: '✓ Clock set to this phone’s local time.' });
  else if (clock.status === 'unsupported') lines.push({ tone: 'info', text: 'This computer doesn’t allow setting its clock from an app.' });
  else if (clock.status === 'error') lines.push({ tone: 'danger', text: clock.message || 'The clock could not be set.' });

  if (result?.restarting) lines.push({ tone: 'info', text: 'The computer is restarting to apply the new gas — it will disconnect. That’s expected.' });

  return { lines, gasSet: gas.status === 'set', gasPending: gas.status === 'pending', clockSet: clock.status === 'set', restarting: Boolean(result?.restarting) };
}
