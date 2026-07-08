export default function Privacidad() {
  return (
    <div style={{minHeight:"100vh",background:"#1A1A1A"}}>
    <div style={{maxWidth:720,margin:"0 auto",padding:"60px 24px",fontFamily:"'DM Sans',sans-serif",color:"#D4D0CB",lineHeight:1.75}}>
      <h1 style={{fontFamily:"Georgia,serif",fontSize:36,marginBottom:8,color:"#fff"}}>Política de Privacidad</h1>
      <p style={{color:"#8A8580",marginBottom:32}}>Última actualización: junio 2026</p>

      <h2 style={{fontSize:20,marginBottom:8,color:"#fff"}}>1. Responsable del tratamiento</h2>
      <p style={{marginBottom:24}}>Airán Velázquez — Forge (forgeapp.es) — coachforgeapp@gmail.com</p>

      <h2 style={{fontSize:20,marginBottom:8,color:"#fff"}}>2. Datos que recogemos</h2>
      <p style={{marginBottom:24}}>Recogemos los datos que el usuario introduce voluntariamente: email (opcional), perfil de entrenamiento (edad, nivel, objetivos, lesiones), historial de conversaciones con el coach y marcas deportivas.</p>

      <h2 style={{fontSize:20,marginBottom:8,color:"#fff"}}>3. Finalidad del tratamiento</h2>
      <p style={{marginBottom:24}}>Los datos se utilizan exclusivamente para personalizar la experiencia de entrenamiento dentro de Forge. No se utilizan para publicidad ni se comparten con terceros salvo los proveedores técnicos necesarios para el funcionamiento del servicio (Supabase, Vercel, Anthropic, Stripe).</p>

      <h2 style={{fontSize:20,marginBottom:8,color:"#fff"}}>4. Base legal</h2>
      <p style={{marginBottom:24}}>El tratamiento se basa en el consentimiento del usuario al utilizar el servicio y, en el caso de suscripciones de pago, en la ejecución del contrato.</p>

      <h2 style={{fontSize:20,marginBottom:8,color:"#fff"}}>5. Conservación de datos</h2>
      <p style={{marginBottom:24}}>Los datos se conservan mientras el usuario mantenga su cuenta activa. El usuario puede solicitar la eliminación en cualquier momento escribiendo a coachforgeapp@gmail.com</p>

      <h2 style={{fontSize:20,marginBottom:8,color:"#fff"}}>6. Derechos del usuario</h2>
      <p style={{marginBottom:24}}>El usuario tiene derecho a acceder, rectificar, suprimir, limitar el tratamiento y oponerse al mismo. Para ejercer estos derechos, escribe a coachforgeapp@gmail.com</p>

      <h2 style={{fontSize:20,marginBottom:8,color:"#fff"}}>7. Proveedores técnicos</h2>
      <p style={{marginBottom:24}}>Forge utiliza los siguientes proveedores: Supabase (base de datos, Irlanda), Vercel (hosting, EEUU — con garantías adecuadas), Anthropic (IA, EEUU — con garantías adecuadas), Stripe (pagos, EEUU — con garantías adecuadas).</p>

      <a href="/v2" style={{color:"#8fbe9f",fontSize:14}}>← Volver a Forge</a>
    </div>
    </div>
  );
}