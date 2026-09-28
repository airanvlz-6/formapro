// Synthetic full seven-day architecture; every optional guidance field is exercised.
export function weeklyBudgetFixture(contextDigest='0'.repeat(64)) {
  const days=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  const purposes=[
    ['carrera','base_aerobica','PRIMARY','Consolidar la base aeróbica para sostener la continuidad semanal y llegar al bloque de Box con disponibilidad de recuperación.'],
    ['box','tecnica','SUPPORTING','Mejorar precisión y consistencia de los patrones de halterofilia, integrando el área de desarrollo confirmada sin desplazar el objetivo principal.'],
    ['carrera','base_aerobica','MAINTENANCE','Mantener exposición aeróbica compatible con la práctica técnica previa y reservar capacidad para el bloque consecutivo de jueves a sábado.'],
    ['box','tecnica','PRIMARY','Desarrollar coordinación global y transferencia entre patrones, manteniendo coherencia con las capacidades acreditadas y el objetivo del bloque.'],
    ['box','tecnica','SUPPORTING','Consolidar control y estabilidad dentro de la práctica global; distribuir la exposición para complementar el jueves sin duplicar su demanda principal.'],
    ['box','tecnica','MAINTENANCE','Integrar los estímulos técnicos de la semana preservando calidad y margen de recuperación para la carrera del domingo y la continuidad posterior.'],
    ['carrera','base_aerobica','SUPPORTING','Cerrar la semana con continuidad aeróbica y una demanda compatible con el trabajo acumulado, evitando convertir la sesión en una prueba de rendimiento.'],
  ];
  return {contractVersion:3,contextDigest,selections:days.map((day,i)=>{
    const [discipline,stimulus,role,adaptation]=purposes[i];
    return {day,state:'TRAIN',discipline,guidance:{kind:'weekly_guidance',version:2,adaptation,stimulus,
      patterns:discipline==='box'?['olympic_lift','squat','hinge','core_antirotacion']:['run','cyclic','locomotion'],
      method:discipline==='box'?'Práctica técnica distribuida y progresiva, con selección y dosificación a cargo del Builder según restricciones, referencias y respuesta acreditadas.':'Trabajo aeróbico continuo, usando referencias fisiológicas acreditadas cuando existan; Builder decide duración y dosis compatibles con el contexto.',
      role,reason:adaptation+' Coordinar con las sesiones adyacentes y ajustar la demanda a la exposición acumulada. Las áreas confirmadas aportan prioridad contextual; las restricciones y referencias conocidas mantienen autoridad.'}};
  })};
}
