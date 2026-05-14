'use client';
import { useState, useRef, useEffect } from "react";

const C = {
  bg: "#F6F4F0", card: "#FFFFFF", ink: "#1A1A1A", muted: "#6B6B6B",
  border: "#E5E0D8", accent: "#1A3C5E", accentLight: "#E8EEF4",
  warm: "#D4622A", warmLight: "#FDF0EB", tag: "#EDEAE4", success: "#2D6A4F", successLight: "#D8F3DC",
};

const CATEGORIAS = [
  { id: "carrera", emoji: "🏃", titulo: "Carrera", subtitulo: "Running & Trail", desc: "Para amantes del running o quienes se inician. Desde tu primer km hasta tu mejor marca.", color: "#1A3C5E", colorLight: "#E8EEF4" },
  { id: "funcional", emoji: "⚡", titulo: "Funcional", subtitulo: "Fitness & Bienestar", desc: "Dinamico y adaptable. Ideal para mantenerse en forma, bajar de peso o sentirse mejor.", color: "#2D6A4F", colorLight: "#D8F3DC" },
  { id: "hibrido", emoji: "🔄", titulo: "Hibrido", subtitulo: "Resistencia + Fuerza", desc: "Para atletas que buscan mejorar en resistencia y fuerza/potencia simultaneamente.", color: "#6B3FA0", colorLight: "#EDE7F6" },
  { id: "fuerza", emoji: "🏋️", titulo: "Fuerza", subtitulo: "Powerlifting & Olimpico", desc: "Para quienes buscan aumentar marcas en levantamientos olimpicos o powerlifting.", color: "#B5300B", colorLight: "#FDECEA" },
];

const FORMULARIOS: Record<string, Array<{id: string; label: string; tipo: string; opciones?: string[]; placeholder?: string}>> = {
  carrera: [
    { id: "edad", label: "Cuantos anos tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Mas de 50"] },
    { id: "sexo", label: "Con que genero te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel", label: "Cual es tu experiencia en carrera?", tipo: "opciones", opciones: ["Inicio ahora (0-3 meses)", "Principiante (3-12 meses)", "Intermedio (1-3 anos)", "Avanzado (+3 anos)"] },
    { id: "distancia_objetivo", label: "Cual es tu distancia objetivo?", tipo: "opciones", opciones: ["5K", "10K", "Media maraton (21K)", "Maraton (42K)", "Trail / Ultra", "Sin distancia fija"] },
    { id: "marca_actual", label: "Tienes alguna marca de referencia?", tipo: "texto", placeholder: "Ej: corro 5K en 30 min, o nunca he corrido en carrera organizada" },
    { id: "dias", label: "Cuantos dias por semana puedes entrenar?", tipo: "opciones", opciones: ["2 dias", "3 dias", "4 dias", "5 dias", "6 dias"] },
    { id: "duracion", label: "Cuanto tiempo disponible por sesion?", tipo: "opciones", opciones: ["30 min", "45 min", "1 hora", "1h 30min", "Mas de 1h 30min"] },
    { id: "superficie", label: "Donde sueles entrenar?", tipo: "multi", opciones: ["Asfalto / ciudad", "Pista de atletismo", "Trail / montana", "Cinta de correr", "Campo de hierba"] },
    { id: "lesiones", label: "Tienes lesiones o molestias?", tipo: "texto", placeholder: "Ej: periostitis, fascitis, rodilla... o ninguna" },
    { id: "objetivo_detalle", label: "Que quieres conseguir exactamente?", tipo: "texto", placeholder: "Ej: completar mi primer 10K en junio, bajar de 45 min..." },
  ],
  funcional: [
    { id: "edad", label: "Cuantos anos tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Mas de 50"] },
    { id: "sexo", label: "Con que genero te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel", label: "Cual es tu nivel de experiencia?", tipo: "opciones", opciones: ["Sedentario / Empiezo de cero", "Algo activo (ejercicio ocasional)", "Moderado (1-2 anos)", "Avanzado (+2 anos)"] },
    { id: "objetivo_principal", label: "Cual es tu objetivo principal?", tipo: "opciones", opciones: ["Perder peso / reducir grasa", "Tonificar y definir", "Ganar energia y bienestar", "Mejorar movilidad", "Mantenerme en forma"] },
    { id: "dias", label: "Cuantos dias por semana puedes entrenar?", tipo: "opciones", opciones: ["2 dias", "3 dias", "4 dias", "5 dias"] },
    { id: "duracion", label: "Cuanto tiempo por sesion?", tipo: "opciones", opciones: ["20-30 min", "30-45 min", "45-60 min", "Mas de 1 hora"] },
    { id: "material", label: "Con que equipamiento cuentas?", tipo: "multi", opciones: ["Solo mi cuerpo (casa / parque)", "Mancuernas", "Bandas elasticas", "Kettlebells", "Maquinas de gimnasio", "Barra de dominadas"] },
    { id: "restricciones", label: "Tienes alguna limitacion fisica o lesion?", tipo: "texto", placeholder: "Ej: dolor lumbar, rodilla operada, hipertension... o ninguna" },
    { id: "objetivo_detalle", label: "Cuentame tu situacion y objetivo", tipo: "texto", placeholder: "Ej: tengo 15 kg de mas, entreno por las mananas..." },
  ],
  hibrido: [
    { id: "edad", label: "Cuantos anos tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Mas de 50"] },
    { id: "sexo", label: "Con que genero te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "experiencia_fuerza", label: "Cuanta experiencia tienes en fuerza?", tipo: "opciones", opciones: ["Poca o ninguna", "1-2 anos", "2-4 anos", "Mas de 4 anos"] },
    { id: "experiencia_cardio", label: "Y en resistencia / cardio?", tipo: "opciones", opciones: ["Poca o ninguna", "1-2 anos", "2-4 anos", "Mas de 4 anos"] },
    { id: "prioridad", label: "Que quieres priorizar?", tipo: "opciones", opciones: ["50/50 equilibrado", "Mas fuerza que resistencia", "Mas resistencia que fuerza", "Potencia explosiva"] },
    { id: "marcas_actuales", label: "Cuales son tus marcas de referencia?", tipo: "texto", placeholder: "Ej: peso muerto 100kg, corro 10K en 50min..." },
    { id: "dias", label: "Cuantos dias por semana puedes entrenar?", tipo: "opciones", opciones: ["3 dias", "4 dias", "5 dias", "6 dias"] },
    { id: "duracion", label: "Cuanto tiempo por sesion?", tipo: "opciones", opciones: ["45 min", "1 hora", "1h 30min", "Mas de 1h 30min"] },
    { id: "material", label: "Con que equipamiento cuentas?", tipo: "multi", opciones: ["Gimnasio completo", "Barras y discos", "Mancuernas", "Kettlebells", "Cinta / Pista", "Bicicleta / Cicloergometro"] },
    { id: "lesiones", label: "Lesiones o limitaciones relevantes?", tipo: "texto", placeholder: "Ej: hombro derecho limitado, lumbar recurrente, o ninguna" },
    { id: "objetivo_detalle", label: "Que quieres lograr en los proximos 3-6 meses?", tipo: "texto", placeholder: "Ej: triatlon sprint, aumentar peso muerto y correr 10K..." },
  ],
  fuerza: [
    { id: "edad", label: "Cuantos anos tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Mas de 50"] },
    { id: "sexo", label: "Con que genero te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "modalidad", label: "En que modalidad te especializas?", tipo: "opciones", opciones: ["Powerlifting (SQ / BP / DL)", "Halterofilia (Arrancada / 2T)", "Strongman / Fuerza general", "Estoy empezando"] },
    { id: "nivel", label: "Cuantos anos llevas entrenando fuerza?", tipo: "opciones", opciones: ["Menos de 1 ano", "1-2 anos", "2-4 anos", "Mas de 4 anos"] },
    { id: "marcas", label: "Cuales son tus marcas actuales (1RM)?", tipo: "texto", placeholder: "Ej: SQ 120kg / BP 90kg / DL 150kg" },
    { id: "competicion", label: "Tienes competicion o fecha objetivo?", tipo: "opciones", opciones: ["Si, en menos de 3 meses", "Si, en 3-6 meses", "Si, en mas de 6 meses", "No compito"] },
    { id: "dias", label: "Cuantos dias puedes entrenar fuerza?", tipo: "opciones", opciones: ["3 dias", "4 dias", "5 dias", "6 dias"] },
    { id: "duracion", label: "Cuanto tiempo por sesion?", tipo: "opciones", opciones: ["1 hora", "1h 30min", "2 horas", "Mas de 2 horas"] },
    { id: "puntos_debiles", label: "Cual es tu eslabon mas debil?", tipo: "texto", placeholder: "Ej: cajon bajo en sentadilla, lockout en press banca..." },
    { id: "lesiones", label: "Lesiones o limitaciones?", tipo: "texto", placeholder: "Ej: munecas limitadas, lumbar sensible, o ninguna" },
    { id: "objetivo_detalle", label: "Que quieres lograr exactamente?", tipo: "texto", placeholder: "Ej: romper 1RM en sentadilla, clasificarme para campeonato..." },
  ],
};

const buildPrompt = (cat: {id: string; titulo: string}, perfil: Record<string, string | string[]>, marcas: {fecha: string; valor: string}[] = [], historialResumen: string = "") => {
  const perfilStr = Object.entries(perfil).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n");
  const marcasStr = marcas.length > 0 ? marcas.map(m => `- ${m.fecha}: ${m.valor}`).join("\n") : "Sin registros aun";
  return `Eres el coach de FormaPro, sistema de asesoramiento de entrenamiento personalizado.
Tu filosofia: la programacion se adapta al deportista, no al reves.
Hablas en espanol, tono cercano, directo y motivador.

PERFIL:
${perfilStr}

PROGRESO REGISTRADO:
${marcasStr}

${historialResumen ? `SESIONES ANTERIORES:\n${historialResumen}` : ""}

PRINCIPIOS: Periodizacion cientifica (lineal/DUP/bloques segun nivel), sobrecarga progresiva, deload cada 3-4 semanas, especificidad al objetivo, adaptacion a lesiones y equipamiento.
FORMATO: Max 400 palabras salvo rutina. Rutina: DIA/EJERCICIO/SERIES x REPS/DESCANSO. Ajusta cambios inmediatamente con justificacion.
${({carrera:`CARRERA: Ciclos 4sem, progresion vol max 10%/sem, zonas Z1-Z5, rodaje largo+series+fuerza complementaria.`,funcional:`FUNCIONAL: Bloques 4-6sem, movilidad+activacion+principal+finisher, patrones empuje/tiron/bisagra/sentadilla/core.`,hibrido:`HIBRIDO: Bloques, minimiza interferencia, fuerza 80-90% 1RM + resistencia Z2/umbral/VO2max.`,fuerza:`FUERZA: Lineal (principiantes), DUP/5-3-1 (intermedios), bloques acumulacion/intensificacion/realizacion (avanzados), % 1RM o RPE.`}[cat.id]||"")}`;
};

const SUGERENCIAS: Record<string, string[]> = {
  carrera: ["Ajusta el volumen", "Registro nueva marca", "Tengo carrera en 3 semanas", "Me duele la rodilla"],
  funcional: ["Tengo menos tiempo", "Registro mi peso actual", "Cambia el entreno de hoy", "Estoy muy cansado"],
  hibrido: ["Prioriza mas fuerza", "Registro mis marcas", "Tengo competicion pronto", "Resumen de mi progreso"],
  fuerza: ["Sube la intensidad", "Registro nuevo 1RM", "Mi sentadilla esta estancada", "Resumen de progreso"],
};

const FREE_LIMIT = 20;
const generarCodigo = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let r = "FP-"; for(let i=0;i<5;i++) r+=c[Math.floor(Math.random()*c.length)]; return r; };

type Categoria = typeof CATEGORIAS[0];
type Pregunta = {id: string; label: string; tipo: string; opciones?: string[]; placeholder?: string};
type Marca = {fecha: string; valor: string};
type UsuarioData = {codigo: string; categoria: string; perfil: Record<string, string | string[]>; rutina: string; historial: {role: string; content: string}[]; marcas: Marca[]};

const Progreso = ({actual,total,color}:{actual:number;total:number;color:string}) => (
  <div style={{width:"100%",height:3,background:C.border,borderRadius:10,marginBottom:28}}>
    <div style={{height:3,borderRadius:10,background:color,width:`${(actual/total)*100}%`,transition:"width 0.4s ease"}}/>
  </div>
);

const Chip = ({active,onClick,children,color}:{active:boolean;onClick:()=>void;children:React.ReactNode;color:string}) => (
  <button onClick={onClick} style={{padding:"9px 16px",borderRadius:100,fontSize:13.5,cursor:"pointer",border:active?`2px solid ${color}`:`2px solid ${C.border}`,background:active?color+"18":C.card,color:active?color:C.ink,fontWeight:active?600:400,transition:"all 0.15s",fontFamily:"inherit"}}>{children}</button>
);

const MensajeTexto = ({texto}:{texto:string}) => (
  <div style={{fontSize:14,lineHeight:1.8,color:C.ink}}>
    {texto.split("\n").map((l,i)=>{
      if(!l.trim()) return <div key={i} style={{height:6}}/>;
      const h=l.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\*(.*?)\*/g,"<em>$1</em>");
      if(l.startsWith("### ")) return <div key={i} style={{fontWeight:700,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginTop:14}} dangerouslySetInnerHTML={{__html:h.replace(/^###\s*/,"")}} />;
      if(l.startsWith("## ")) return <div key={i} style={{fontWeight:700,fontSize:15,marginTop:16}} dangerouslySetInnerHTML={{__html:h.replace(/^##\s*/,"")}} />;
      if(l.match(/^[-]/)) return <div key={i} style={{paddingLeft:16,position:"relative",marginBottom:2}}><span style={{position:"absolute",left:4,color:C.muted}}>.</span><span dangerouslySetInnerHTML={{__html:h.replace(/^[-]\s*/,"")}} /></div>;
      return <div key={i} dangerouslySetInnerHTML={{__html:h}}/>;
    })}
  </div>
);

export default function FormaPro() {
  const [pantalla,setPantalla]=useState("inicio");
  const [categoria,setCategoria]=useState<string|null>(null);
  const [pregIdx,setPregIdx]=useState(0);
  const [respuestas,setRespuestas]=useState<Record<string,string|string[]>>({});
  const [selMulti,setSelMulti]=useState<string[]>([]);
  const [textoTemp,setTextoTemp]=useState("");
  const [mensajes,setMensajes]=useState<{role:string;content:string}[]>([]);
  const [historial,setHistorial]=useState<{role:string;content:string}[]>([]);
  const [input,setInput]=useState("");
  const [cargando,setCargando]=useState(false);
  const [generando,setGenerando]=useState(false);
  const [msgCount,setMsgCount]=useState(0);
  const [codigoUsuario,setCodigoUsuario]=useState("");
  const [codigoInput,setCodigoInput]=useState("");
  const [marcas,setMarcas]=useState<Marca[]>([]);
  const [mostrarMarcas,setMostrarMarcas]=useState(false);
  const [nuevaMarca,setNuevaMarca]=useState("");
  const [codigoGuardado,setCodigoGuardado]=useState("");
  const [errorCodigo,setErrorCodigo]=useState("");
  const bottomRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[mensajes,cargando,generando]);

  const cat=categoria?CATEGORIAS.find((c:Categoria)=>c.id===categoria):null;
  const preguntas:Pregunta[]=categoria?FORMULARIOS[categoria]:[];
  const pregActual=preguntas[pregIdx];
  const bloqueado=msgCount>=FREE_LIMIT;
  const accentColor=cat?.color||C.accent;

  const apiCall=async(body:Record<string,unknown>)=>{
    const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    return res.json();
  };

  const recuperarUsuario=async()=>{
    if(!codigoInput.trim()) return;
    setErrorCodigo("");
    const data=await apiCall({action:"recuperar_usuario",codigo:codigoInput.trim().toUpperCase()});
    if(data.error){setErrorCodigo("Codigo no encontrado. Verifica e intentalo de nuevo.");return;}
    const u:UsuarioData=data.data;
    setCodigoUsuario(u.codigo);setCategoria(u.categoria);setRespuestas(u.perfil);
    setMarcas(u.marcas||[]);setHistorial(u.historial||[]);
    setMensajes(u.historial?.filter((m:{role:string})=>m.role==="assistant").slice(-1)||[]);
    setMsgCount(1);setPantalla("chat");
    setTimeout(()=>reanudarSesion(u),300);
  };

  const reanudarSesion=async(u:UsuarioData)=>{
    setGenerando(true);
    const catObj=CATEGORIAS.find((c:Categoria)=>c.id===u.categoria)!;
    const resumen=u.historial?.slice(-6).map((m:{role:string;content:string})=>`${m.role==="user"?"Usuario":"Coach"}: ${m.content.substring(0,150)}...`).join("\n")||"";
    const prompt="Hola de nuevo! Estoy de vuelta. Recuerdame brevemente en que punto estabamos, como va mi progreso y que toca esta semana.";
    const nuevoHist=[...(u.historial||[]),{role:"user",content:prompt}];
    try{
      const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:1000,system:buildPrompt(catObj,u.perfil,u.marcas||[],resumen),messages:nuevoHist});
      const texto=data.content?.map((b:{text?:string})=>b.text||"").join("")||"Error.";
      const hist=[...nuevoHist,{role:"assistant",content:texto}];
      setMensajes([{role:"assistant",content:texto}]);setHistorial(hist);
      await apiCall({action:"actualizar_usuario",codigo:u.codigo,datos:{historial:hist}});
    }catch{setMensajes([{role:"assistant",content:"Error al reanudar sesion."}]);}
    finally{setGenerando(false);}
  };

  const irACategoria=(catId:string)=>{setCategoria(catId);setPregIdx(0);setRespuestas({});setSelMulti([]);setTextoTemp("");setPantalla("formulario");};

  const avanzar=()=>{
    const val=pregActual.tipo==="multi"?selMulti:pregActual.tipo==="texto"?textoTemp:respuestas[pregActual.id];
    if(!val||(Array.isArray(val)&&val.length===0)||(typeof val==="string"&&!val.trim())) return;
    const nuevas={...respuestas,[pregActual.id]:val};
    setRespuestas(nuevas);setSelMulti([]);setTextoTemp("");
    if(pregIdx<preguntas.length-1){setPregIdx(pregIdx+1);}else{iniciarChat(nuevas);}
  };

  const toggleMulti=(op:string)=>setSelMulti(prev=>prev.includes(op)?prev.filter(x=>x!==op):[...prev,op]);

  const iniciarChat=async(perfil:Record<string,string|string[]>)=>{
    setPantalla("chat");setGenerando(true);
    const catObj=CATEGORIAS.find((c:Categoria)=>c.id===categoria)!;
    const codigo=generarCodigo();setCodigoGuardado(codigo);
    const prompt="Hola! Acabo de completar mi perfil. Por favor: 1) Dame la bienvenida breve mostrando que entiendes mi situacion. 2) Genera mi programacion semanal completa con base cientifica y periodizacion. 3) Explica la logica de periodizacion que usaras. 4) Preguntame si quiero ajustar algo.";
    try{
      const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:1000,system:buildPrompt(catObj,perfil),messages:[{role:"user",content:prompt}]});
      const texto=data.content?.map((b:{text?:string})=>b.text||"").join("")||"Error al conectar.";
      const hist=[{role:"user",content:prompt},{role:"assistant",content:texto}];
      setMensajes([{role:"assistant",content:texto}]);setHistorial(hist);setMsgCount(1);setCodigoUsuario(codigo);
      await apiCall({action:"guardar_usuario",datos:{codigo,categoria,perfil,rutina:texto,historial:hist,marcas:[]}});
    }catch{setMensajes([{role:"assistant",content:"Error de conexion. Por favor recarga."}]);}
    finally{setGenerando(false);setTimeout(()=>inputRef.current?.focus(),300);}
  };

  const enviar=async(texto:string=input)=>{
    if(!texto.trim()||cargando||bloqueado) return;
    const nuevoHist=[...historial,{role:"user",content:texto.trim()}];
    setMensajes(prev=>[...prev,{role:"user",content:texto.trim()}]);
    setInput("");setCargando(true);setMsgCount(c=>c+1);
    const catObj=CATEGORIAS.find((c:Categoria)=>c.id===categoria)!;
    try{
      const resumen=historial.slice(-6).map(m=>`${m.role==="user"?"Usuario":"Coach"}: ${m.content.substring(0,150)}...`).join("\n");
      const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:1000,system:buildPrompt(catObj,respuestas,marcas,resumen),messages:nuevoHist});
      const respText=data.content?.map((b:{text?:string})=>b.text||"").join("")||"Error.";
      const hist=[...nuevoHist,{role:"assistant",content:respText}];
      setMensajes(prev=>[...prev,{role:"assistant",content:respText}]);setHistorial(hist);
      if(codigoUsuario) await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{historial:hist}});
    }catch{setMensajes(prev=>[...prev,{role:"assistant",content:"Error. Intentalo de nuevo."}]);}
    finally{setCargando(false);}
  };

  const registrarMarca=async()=>{
    if(!nuevaMarca.trim()) return;
    const nueva:Marca={fecha:new Date().toLocaleDateString("es-ES"),valor:nuevaMarca.trim()};
    const nuevasMarcas=[...marcas,nueva];
    setMarcas(nuevasMarcas);setNuevaMarca("");setMostrarMarcas(false);
    if(codigoUsuario) await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{marcas:nuevasMarcas}});
    enviar(`He registrado una nueva marca: ${nueva.valor}. Analiza este progreso y ajusta mi programacion si es necesario.`);
  };

  const handleKey=(e:React.KeyboardEvent)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();enviar();}};
  const restantes=FREE_LIMIT-msgCount;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'DM Sans', sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 16px"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        h1,h2,h3{font-family:'Playfair Display',Georgia,serif;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px;}
        .cat-card{transition:all 0.2s;cursor:pointer;}
        .cat-card:hover{transform:translateY(-3px);border-color:#999 !important;}
        .btn-main{transition:all 0.15s;}
        .btn-main:hover{filter:brightness(0.88);}
        .btn-main:active{transform:scale(0.97);}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .fade-up{animation:fadeUp 0.3s ease forwards;}
        @keyframes dotPulse{0%,80%,100%{opacity:0.25;transform:scale(0.8)}40%{opacity:1;transform:scale(1)}}
        .dot{width:7px;height:7px;border-radius:50%;animation:dotPulse 1.3s infinite;display:inline-block;}
        textarea,input{resize:none;font-family:inherit;}
        textarea:focus,input:focus{outline:none;}
        .sugg:hover{opacity:0.75;}
      `}</style>

      {pantalla==="inicio"&&(
        <div className="fade-up" style={{maxWidth:520,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:44,marginBottom:16}}>🏅</div>
          <h1 style={{fontSize:"clamp(36px,8vw,54px)",color:C.ink,lineHeight:1.1,marginBottom:14}}>FormaPro</h1>
          <p style={{color:C.muted,fontSize:17,lineHeight:1.65,marginBottom:8}}>Coach de entrenamiento personal. Siempre disponible, seguimiento de progreso y adaptado a tu vida.</p>
          <p style={{color:C.muted,fontSize:14,marginBottom:32}}>Tu programa evoluciona contigo cada semana.</p>
          <button className="btn-main" onClick={()=>setPantalla("categoria")} style={{background:C.ink,color:"#fff",border:"none",borderRadius:14,padding:"16px 40px",fontSize:16,fontWeight:600,cursor:"pointer",width:"100%",maxWidth:360,marginBottom:20}}>
            Crear mi programa
          </button>
          <div style={{maxWidth:360,margin:"0 auto"}}>
            <p style={{color:C.muted,fontSize:13,marginBottom:10}}>Ya tienes un programa? Introduce tu codigo:</p>
            <div style={{display:"flex",gap:8}}>
              <input value={codigoInput} onChange={e=>setCodigoInput(e.target.value.toUpperCase())} placeholder="FP-XXXXX"
                style={{flex:1,border:`2px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.ink,background:C.card,letterSpacing:2,textAlign:"center"}}
                onKeyDown={e=>e.key==="Enter"&&recuperarUsuario()}
              />
              <button className="btn-main" onClick={recuperarUsuario} style={{background:C.accent,color:"#fff",border:"none",borderRadius:12,padding:"12px 18px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                Entrar
              </button>
            </div>
            {errorCodigo&&<p style={{color:C.warm,fontSize:12,marginTop:8}}>{errorCodigo}</p>}
          </div>
          <p style={{color:C.muted,fontSize:12,marginTop:20}}>{FREE_LIMIT} consultas gratuitas - Sin registro</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginTop:24}}>
            {["Basado en ciencia","Adaptado a tu día a día","Múltiples disciplinas","Recuerda tu progreso"].map(t=>(
              <span key={t} style={{background:C.tag,color:C.muted,borderRadius:100,padding:"5px 14px",fontSize:12}}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {pantalla==="categoria"&&(
        <div className="fade-up" style={{maxWidth:580,width:"100%"}}>
          <button onClick={()=>setPantalla("inicio")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,marginBottom:28}}>Volver</button>
          <h2 style={{fontSize:"clamp(22px,5vw,30px)",color:C.ink,marginBottom:8}}>Cual es tu disciplina?</h2>
          <p style={{color:C.muted,fontSize:14,marginBottom:28}}>Tu programa se construira desde cero segun lo que elijas.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))",gap:14}}>
            {CATEGORIAS.map((c:Categoria)=>(
              <div key={c.id} className="cat-card" onClick={()=>irACategoria(c.id)} style={{background:C.card,border:`2px solid ${C.border}`,borderRadius:20,padding:"24px 22px"}}>
                <div style={{fontSize:34,marginBottom:12}}>{c.emoji}</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:18,color:C.ink,marginBottom:2}}>{c.titulo}</div>
                <div style={{color:c.color,fontSize:12,fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{c.subtitulo}</div>
                <div style={{color:C.muted,fontSize:13,lineHeight:1.55}}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pantalla==="formulario"&&pregActual&&cat&&(
        <div className="fade-up" style={{maxWidth:500,width:"100%"}}>
          <div style={{display:"flex",alignItems:"center",marginBottom:20}}>
            <button onClick={()=>{if(pregIdx===0)setPantalla("categoria");else{setPregIdx(pregIdx-1);setSelMulti([]);setTextoTemp("");}}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>Atras</button>
            <span style={{marginLeft:"auto",color:C.muted,fontSize:13}}>{pregIdx+1} / {preguntas.length}</span>
          </div>
          <Progreso actual={pregIdx+1} total={preguntas.length} color={accentColor}/>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,background:cat.colorLight,borderRadius:100,padding:"5px 14px",marginBottom:20}}>
            <span style={{fontSize:15}}>{cat.emoji}</span>
            <span style={{color:accentColor,fontSize:12,fontWeight:600}}>{cat.titulo}</span>
          </div>
          <h2 style={{fontSize:"clamp(17px,4vw,23px)",color:C.ink,marginBottom:22,lineHeight:1.4}}>{pregActual.label}</h2>
          {pregActual.tipo==="opciones"&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:9,marginBottom:28}}>
              {pregActual.opciones?.map(op=><Chip key={op} active={respuestas[pregActual.id]===op} color={accentColor} onClick={()=>setRespuestas(p=>({...p,[pregActual.id]:op}))}>{op}</Chip>)}
            </div>
          )}
          {pregActual.tipo==="multi"&&(
            <><p style={{color:C.muted,fontSize:12,marginBottom:10}}>Selecciona todos los que apliquen</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:9,marginBottom:28}}>
              {pregActual.opciones?.map(op=><Chip key={op} active={selMulti.includes(op)} color={accentColor} onClick={()=>toggleMulti(op)}>{op}</Chip>)}
            </div></>
          )}
          {pregActual.tipo==="texto"&&(
            <textarea value={textoTemp} onChange={e=>setTextoTemp(e.target.value)} rows={3} placeholder={pregActual.placeholder}
              style={{width:"100%",border:`2px solid ${C.border}`,borderRadius:14,padding:"13px 15px",fontSize:14,color:C.ink,background:C.card,lineHeight:1.65,marginBottom:28,transition:"border-color 0.15s"}}
              onFocus={e=>(e.target.style.borderColor=accentColor)} onBlur={e=>(e.target.style.borderColor=C.border)}
            />
          )}
          <button className="btn-main" onClick={avanzar}
            disabled={(pregActual.tipo==="opciones"&&!respuestas[pregActual.id])||(pregActual.tipo==="multi"&&selMulti.length===0)||(pregActual.tipo==="texto"&&!textoTemp.trim())}
            style={{width:"100%",background:accentColor,color:"#fff",border:"none",borderRadius:14,padding:"15px",fontSize:15,fontWeight:600,cursor:"pointer",opacity:((pregActual.tipo==="opciones"&&!respuestas[pregActual.id])||(pregActual.tipo==="multi"&&selMulti.length===0)||(pregActual.tipo==="texto"&&!textoTemp.trim()))?0.35:1}}>
            {pregIdx<preguntas.length-1?"Siguiente":"Generar mi programa"}
          </button>
        </div>
      )}

      {pantalla==="chat"&&cat&&(
        <div style={{width:"100%",maxWidth:700,display:"flex",flexDirection:"column",height:"93vh",maxHeight:860}}>
          {codigoGuardado&&(
            <div style={{background:C.successLight,border:`1px solid ${C.success}33`,borderRadius:12,padding:"10px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>🔑</span>
              <div style={{flex:1}}>
                <span style={{color:C.success,fontSize:13,fontWeight:600}}>Tu codigo de acceso: </span>
                <span style={{color:C.ink,fontSize:15,fontWeight:700,letterSpacing:2}}>{codigoGuardado}</span>
              </div>
              <span style={{color:C.muted,fontSize:11}}>Guardalo para volver</span>
            </div>
          )}

          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <button onClick={()=>{setPantalla("inicio");setMensajes([]);setHistorial([]);setMsgCount(0);setCodigoGuardado("");}} style={{background:C.card,border:`1px solid ${C.border}`,color:C.muted,cursor:"pointer",borderRadius:10,padding:"8px 14px",fontSize:13}}>Salir</button>
            <div style={{flex:1,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:38,height:38,borderRadius:12,background:cat.colorLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{cat.emoji}</div>
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:15,color:C.ink}}>FormaPro Coach</div>
                <div style={{color:accentColor,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>{cat.titulo} - {cat.subtitulo}</div>
              </div>
            </div>
            <button onClick={()=>setMostrarMarcas(!mostrarMarcas)} style={{background:cat.colorLight,border:"none",borderRadius:10,padding:"7px 12px",fontSize:12,color:accentColor,cursor:"pointer",fontWeight:600}}>
              📊 Progreso
            </button>
            <div style={{background:restantes<=5?"#FFF3CD":cat.colorLight,color:restantes<=5?"#856404":accentColor,borderRadius:100,padding:"5px 12px",fontSize:12,fontWeight:500}}>
              {restantes>0?`${restantes} libres`:"Limite"}
            </div>
          </div>

          {mostrarMarcas&&(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",marginBottom:10}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:16,color:C.ink,marginBottom:12}}>Registro de progreso</div>
              {marcas.length===0?(
                <p style={{color:C.muted,fontSize:13,marginBottom:12}}>Sin registros aun. Anade tu primera marca o tiempo.</p>
              ):(
                <div style={{marginBottom:12,maxHeight:120,overflowY:"auto"}}>
                  {marcas.map((m,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                      <span style={{color:C.muted}}>{m.fecha}</span>
                      <span style={{color:C.ink,fontWeight:500}}>{m.valor}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                <input value={nuevaMarca} onChange={e=>setNuevaMarca(e.target.value)} placeholder="Ej: 5K en 24:30, SQ 125kg, peso 78kg..."
                  style={{flex:1,border:`2px solid ${C.border}`,borderRadius:10,padding:"9px 12px",fontSize:13,color:C.ink,background:C.bg}}
                  onKeyDown={e=>e.key==="Enter"&&registrarMarca()}
                />
                <button onClick={registrarMarca} style={{background:accentColor,color:"#fff",border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                  Guardar
                </button>
              </div>
            </div>
          )}

          <div style={{flex:1,overflowY:"auto",background:C.card,borderRadius:20,border:`1px solid ${C.border}`,padding:"20px 18px",display:"flex",flexDirection:"column",gap:18}}>
            {generando&&(
              <div style={{display:"flex",gap:12}}>
                <div style={{width:36,height:36,borderRadius:12,background:cat.colorLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.emoji}</div>
                <div style={{background:C.bg,borderRadius:"4px 16px 16px 16px",padding:"16px 18px"}}>
                  <p style={{color:C.muted,fontSize:13,marginBottom:10}}>Preparando tu sesion...</p>
                  <div style={{display:"flex",gap:5}}>{[0,1,2].map(j=><div key={j} className="dot" style={{background:accentColor,animationDelay:`${j*0.2}s`}}/>)}</div>
                </div>
              </div>
            )}
            {mensajes.map((msg,i)=>(
              <div key={i} className="fade-up" style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",gap:10,alignItems:"flex-start"}}>
                {msg.role==="assistant"&&<div style={{width:36,height:36,borderRadius:12,background:cat.colorLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.emoji}</div>}
                <div style={{maxWidth:"80%",padding:"13px 17px",borderRadius:msg.role==="user"?"16px 4px 16px 16px":"4px 16px 16px 16px",background:msg.role==="user"?accentColor:C.bg,color:msg.role==="user"?"#fff":C.ink}}>
                  {msg.role==="assistant"?<MensajeTexto texto={msg.content}/>:<p style={{fontSize:14,lineHeight:1.6}}>{msg.content}</p>}
                </div>
              </div>
            ))}
            {cargando&&(
              <div style={{display:"flex",gap:12}}>
                <div style={{width:36,height:36,borderRadius:12,background:cat.colorLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.emoji}</div>
                <div style={{background:C.bg,borderRadius:"4px 16px 16px 16px",padding:"14px 18px",display:"flex",gap:5,alignItems:"center"}}>
                  {[0,1,2].map(j=><div key={j} className="dot" style={{background:accentColor,animationDelay:`${j*0.2}s`}}/>)}
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {bloqueado&&(
            <div style={{marginTop:12,background:C.warmLight,border:`1px solid #F5C2A0`,borderRadius:16,padding:"18px 22px"}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:C.ink,marginBottom:6}}>Consultas gratuitas agotadas</div>
              <p style={{color:C.muted,fontSize:13,marginBottom:14,lineHeight:1.6}}>Actualiza a FormaPro Premium para consultas ilimitadas y seguimiento continuo.</p>
              <button className="btn-main" style={{background:C.warm,color:"#fff",border:"none",borderRadius:12,padding:"13px 26px",fontSize:15,fontWeight:600,cursor:"pointer"}}>
                Obtener Premium
              </button>
            </div>
          )}

          {!bloqueado&&(
            <>
              <div style={{marginTop:10,display:"flex",gap:8,alignItems:"flex-end"}}>
                <div style={{flex:1,background:C.card,border:`2px solid ${C.border}`,borderRadius:16,padding:"11px 15px"}}>
                  <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
                    placeholder="Pregunta, pide ajustes o cuentame cambios..."
                    rows={1} disabled={cargando}
                    style={{width:"100%",background:"transparent",border:"none",color:C.ink,fontSize:14,lineHeight:1.6,maxHeight:100,overflow:"auto",padding:0}}
                    onInput={(e)=>{const t=e.target as HTMLTextAreaElement;t.style.height="auto";t.style.height=t.scrollHeight+"px";}}
                  />
                </div>
                <button onClick={()=>enviar()} disabled={cargando||!input.trim()}
                  style={{background:input.trim()&&!cargando?accentColor:C.border,border:"none",borderRadius:13,width:48,height:48,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.2s"}}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13" stroke={input.trim()&&!cargando?"#fff":C.muted} strokeWidth="2.5" strokeLinecap="round"/>
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={input.trim()&&!cargando?"#fff":C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              {mensajes.length>0&&!cargando&&(
                <div style={{display:"flex",gap:7,marginTop:8,flexWrap:"wrap"}}>
                  {(SUGERENCIAS[categoria||""]||[]).map(s=>(
                    <button key={s} className="sugg" onClick={()=>enviar(s)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:100,padding:"5px 13px",fontSize:12,color:C.muted,cursor:"pointer",transition:"all 0.15s"}}>{s}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
