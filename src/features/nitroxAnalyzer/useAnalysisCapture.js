import { useCallback, useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';

import { PHASE, holdReading, manualResult, startAnalysis, stepAnalysis } from './analysis';
import { AIR_O2_PERCENT } from './model';

/** Runs one tank analysis against the live (smoothed) analyzer reading. */
export default function useAnalysisCapture(analyzer) {
  const [analysis, setAnalysis] = useState(null);
  const lastPhase = useRef(null);

  useEffect(() => {
    if (analyzer.o2 == null) return;
    setAnalysis((s) => (s ? stepAnalysis(s, { o2: analyzer.o2, stable: analyzer.stable, now: Date.now() }) : s));
  }, [analyzer.o2, analyzer.stable]);

  // A buzz when the result locks, so the diver can look away from the screen while flowing gas.
  useEffect(() => {
    const phase = analysis?.phase || null;
    if (phase === PHASE.done && lastPhase.current !== PHASE.done && analysis.result?.method === 'auto') Vibration.vibrate(250);
    lastPhase.current = phase;
  }, [analysis]);

  const start = useCallback(() => {
    // Baseline is the ambient reading — if gas is already flowing, fall back to air.
    const o2 = analyzer.o2;
    const baseline = Number.isFinite(o2) && Math.abs(o2 - AIR_O2_PERCENT) < 1 ? o2 : AIR_O2_PERCENT;
    setAnalysis(startAnalysis(baseline));
  }, [analyzer.o2]);

  const hold = useCallback(() => setAnalysis((s) => holdReading(s || startAnalysis(), analyzer.o2)), [analyzer.o2]);
  const enterManually = useCallback((value) => {
    const next = manualResult(value);
    if (next) setAnalysis(next);
    return Boolean(next);
  }, []);
  const reset = useCallback(() => setAnalysis(null), []);

  return { analysis, result: analysis?.phase === PHASE.done ? analysis.result : null, start, hold, enterManually, reset };
}
