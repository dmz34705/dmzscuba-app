// What the atlas needs to know about the diver to answer "can I dive this?": the depth their highest
// recreational card is trained to, and the overhead training they hold. Only this summary goes to the
// map — never the cards themselves (names, numbers, agencies stay in the app).
import { cardsFor } from '../planner/model';

// The depths the major agencies (PADI, SSI, NAUI) teach each level to, in metres and the feet divers quote.
const LEVELS = [
  { key: 'deep', label: 'Deep Diver', limitMeters: 40, limitFeet: 130 },
  { key: 'advanced', label: 'Advanced Open Water', limitMeters: 30, limitFeet: 100 },
  { key: 'open-water', label: 'Open Water', limitMeters: 18, limitFeet: 60 },
];

// `certifications`: the account's cards, or null when signed out.
export function diverProfile(certifications) {
  if (!Array.isArray(certifications)) return { signedIn: false };
  const has = key => cardsFor(certifications, key).length > 0;
  const level = LEVELS.find(entry => has(entry.key));
  return {
    signedIn: true,
    cards: certifications.length,
    ...(level ? { label: level.label, limitMeters: level.limitMeters, limitFeet: level.limitFeet } : {}),
    wreck: has('wreck'), cavern: has('cavern'), cave: has('cave'),
  };
}
