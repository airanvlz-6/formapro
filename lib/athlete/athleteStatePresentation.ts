/** Presentation of server state only; no lifecycle decisions are made in the client. */
export function athleteStatePresentation(state: unknown) {
  if (state === 'restricted') return {
    title: '🔴 Entrenamiento restringido', athleteTitle: '🔴 Estado: Restringido',
    description: 'Forge está adaptando tu planificación debido a una restricción activa.',
    background: 'linear-gradient(135deg,#8B0000,#5C0000)', color: '#8B0000',
  };
  if (state === 'reassessment') return {
    title: '🟡 Reevaluación en curso', athleteTitle: '🟡 Estado: Reevaluación',
    description: 'Forge está comprobando tu tolerancia antes de retirar las restricciones restantes.',
    background: 'linear-gradient(135deg,#705000,#493500)', color: '#705000',
  };
  return null;
}
