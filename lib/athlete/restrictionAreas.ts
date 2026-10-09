// Vocabulario canonico de zonas de restriccion y las propiedades biomecanicas que prohiben.
// UNICA definicion: la usan el motor de restricciones del Coach (route.ts) y el editor del perfil canonico.
// Anadir una zona = anadir una entrada aqui; ningun motor compartido cambia.
export type RestrictionProhibitions = { impact?: boolean; jump?: boolean; axial_load?: boolean; deep_flexion?: boolean; overhead_load?: boolean };
export const RESTRICTION_AREA_PROHIBITIONS: Readonly<Record<string, RestrictionProhibitions>> = {
  rodilla: { impact: true, jump: true, deep_flexion: true },
  hombro: { overhead_load: true },
  lumbar: { axial_load: true, deep_flexion: true },
  tobillo: { impact: true, jump: true },
  muñeca: { overhead_load: true },
};
export const RESTRICTION_AREAS = Object.keys(RESTRICTION_AREA_PROHIBITIONS);
