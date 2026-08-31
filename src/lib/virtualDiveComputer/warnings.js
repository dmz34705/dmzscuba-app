const WARNING_DEFINITIONS = Object.freeze([
  { fact: 'ceilingViolation', code: 'ceiling-violation', label: 'DESCEND TO CEILING', priority: 500, severity: 'danger' },
  { fact: 'modExceeded', code: 'mod-exceeded', label: 'HIGH PO2', priority: 400, severity: 'danger' },
  { fact: 'o2SatAlarm', code: 'o2-sat-alarm', label: 'O2 EXPOSURE LIMIT', priority: 380, severity: 'danger' },
  { fact: 'rapidAscent', code: 'rapid-ascent', label: 'SLOW ASCENT', priority: 300, severity: 'danger' },
  { fact: 'decompressionRequired', code: 'decompression-required', label: 'DECOMPRESSION', priority: 200, severity: 'warning' },
  { fact: 'o2SatWarning', code: 'o2-sat-warning', label: 'O2 EXPOSURE HIGH', priority: 150, severity: 'warning' },
  { fact: 'lowNdl', code: 'low-ndl', label: 'LOW NDL', priority: 100, severity: 'warning' },
]);

export function warningPresentationsForFacts(warningFacts) {
  return WARNING_DEFINITIONS
    .filter((definition) => Boolean(warningFacts?.[definition.fact]))
    .map(({ code, label, priority, severity }) => ({ code, label, priority, severity }));
}

export function highestPriorityWarning(warningFacts) {
  return warningPresentationsForFacts(warningFacts)[0] || null;
}
