import { useState, useRef, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, AlertTriangle, Share2 } from 'lucide-react';

const C = {
  bg: '#050505',
  ink: '#F5F2EC',
  muted: '#7A756E',
  accent: '#FF6B00',
};

type Disciplina = 'carrera' | 'crossfit';
type Formato = '9:16' | '4:5' | '1:1';

const FORMATOS: Record<Formato, { w: number; h: number; label: string }> = {
  '9:16': { w: 405, h: 720, label: 'Story' },
  '4:5': { w: 480, h: 600, label: 'Feed' },
  '1:1': { w: 480, h: 480, label: 'Cuadrado' },
};

const FILTROS: { id: string; label: string; css: string }[] = [
  { id: 'original', label: 'Original', css: 'none' },
  { id: 'mono', label: 'Mono', css: 'grayscale(1) contrast(1.1)' },
  { id: 'contraste', label: 'Contraste', css: 'contrast(1.35) saturate(1.15)' },
  { id: 'calido', label: 'Cálido', css: 'sepia(0.25) saturate(1.3) contrast(1.05)' },
  { id: 'frio', label: 'Frío', css: 'hue-rotate(-8deg) saturate(1.1) brightness(0.97)' },
  { id: 'noche', label: 'Noche', css: 'brightness(0.85) contrast(1.2) saturate(0.9)' },
];

interface RunningData {
  distancia?: string;
  tiempo?: string;
  ritmo?: string;
  fcMedia?: string;
  fcMax?: string;
  desnivel?: string;
  intervalos?: string;
  etiquetaTipo?: string;
}

interface CrossfitData {
  nombreWod?: string;
  resultado?: string;
  tipo?: string;
  movimientos?: string;
}

interface WorkoutShareCardProps {
  disciplina: Disciplina;
  fecha: string;
  running?: RunningData;
  crossfit?: CrossfitData;
  onClose?: () => void;
}

function calcularResultadoPrincipalRunning(data: RunningData): { principal: string; secundario: string | null } {
  if (data.intervalos) return { principal: `${data.intervalos.toUpperCase()} M`, secundario: data.ritmo ? `${data.ritmo} /KM` : null };
  if (data.distancia && data.tiempo) return { principal: `${data.distancia} KM`, secundario: data.ritmo ? `${data.ritmo} /KM` : data.tiempo };
  if (data.distancia && data.ritmo) return { principal: `${data.distancia} KM`, secundario: `${data.ritmo} /KM` };
  if (data.distancia) return { principal: `${data.distancia} KM`, secundario: null };
  if (data.tiempo) return { principal: data.tiempo, secundario: data.ritmo ? `${data.ritmo} /KM` : null };
  return { principal: '', secundario: null };
}

function calcularEtiquetaRunning(data: RunningData): string {
  if (data.etiquetaTipo) return data.etiquetaTipo;
  if (data.intervalos) return 'INTERVALS';
  return 'RUN';
}

// ============================================================
// Overlay de datos — JSX real, la MISMA representacion que se ve
// en pantalla y la que se captura. Sin duplicacion de logica.
// ============================================================
function RunningOverlay({ data }: { data: RunningData }) {
  const { principal, secundario } = calcularResultadoPrincipalRunning(data);
  const etiqueta = calcularEtiquetaRunning(data);
  const metricas = [
    data.intervalos && data.distancia && `${data.distancia} KM`,
    data.fcMedia && `${data.fcMedia} FC`,
    data.fcMax && `${data.fcMax} MAX`,
    data.desnivel && `${data.desnivel} D+`,
  ].filter(Boolean).slice(0, 3) as string[];

  return (
    <div style={{ position: 'relative', zIndex: 3, padding: '0 26px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ color: C.accent, fontSize: 11, fontWeight: 800, letterSpacing: 2, margin: 0 }}>{etiqueta}</p>
      {principal ? (
        <p style={{ color: C.ink, fontSize: 40, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, margin: 0, textShadow: '0 2px 16px rgba(0,0,0,0.6)' }}>{principal}</p>
      ) : (
        <p style={{ color: C.muted, fontSize: 14, fontStyle: 'italic', margin: 0 }}>Añade los datos de tu entreno</p>
      )}
      {secundario && <p style={{ color: C.ink, fontSize: 17, fontWeight: 700, fontFamily: 'Georgia, serif', opacity: 0.9, margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>{secundario}</p>}
      {metricas.length > 0 && <p style={{ color: C.muted, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.4, margin: '3px 0 0' }}>{metricas.join(' · ')}</p>}
    </div>
  );
}

function CrossfitOverlay({ data }: { data: CrossfitData }) {
  const movimientos = data.movimientos && data.movimientos.length > 70 ? data.movimientos.slice(0, 67).trim() + '...' : data.movimientos;
  return (
    <div style={{ position: 'relative', zIndex: 3, padding: '0 26px 18px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <p style={{ color: C.accent, fontSize: 11, fontWeight: 800, letterSpacing: 2, margin: 0 }}>WOD{data.tipo ? ` · ${data.tipo.toUpperCase()}` : ''}</p>
      <p style={{ color: C.ink, fontSize: 20, fontWeight: 800, margin: 0, lineHeight: 1.15, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>{data.nombreWod || 'Entreno de hoy'}</p>
      {data.resultado ? (
        <p style={{ color: C.ink, fontSize: 38, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, margin: '4px 0 0', textShadow: '0 2px 16px rgba(0,0,0,0.6)' }}>{data.resultado}</p>
      ) : (
        <p style={{ color: C.muted, fontSize: 14, fontStyle: 'italic', margin: '4px 0 0' }}>Añade tu resultado</p>
      )}
      {movimientos && <p style={{ color: C.muted, fontSize: 11, margin: '5px 0 0', lineHeight: 1.4 }}>{movimientos}</p>}
    </div>
  );
}

function distanciaEntreToques(t0: React.Touch, t1: React.Touch) {
  return Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
}

// ============================================================
// Componente principal — HTML/CSS real. La Card SIEMPRE se renderiza
// a tamaño fisico fijo (dims.w x dims.h reales en px); el ajuste a
// pantalla se hace unicamente sobre el CONTENEDOR padre via zoom CSS
// (no transform), que no afecta a como html2canvas mide el nodo hijo.
// ============================================================
export default function WorkoutShareCard({ disciplina, fecha, running, crossfit, onClose }: WorkoutShareCardProps) {
  const [foto, setFoto] = useState<string | null>(null);
  const [fotoBajaResolucion, setFotoBajaResolucion] = useState(false);
  const [formato, setFormato] = useState<Formato>('9:16');
  const [filtro, setFiltro] = useState('original');
  const [zoom, setZoom] = useState(1);
  const [posX, setPosX] = useState(50);
  const [posY, setPosY] = useState(50);
  const [procesando, setProcesando] = useState(false);
  const [escalaViewport, setEscalaViewport] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dims = FORMATOS[formato];

  useEffect(() => {
    const calcular = () => {
      const maxAlto = window.innerHeight - 300;
      const maxAncho = Math.min(window.innerWidth - 48, 460);
      setEscalaViewport(Math.min(maxAncho / dims.w, maxAlto / dims.h));
    };
    calcular();
    window.addEventListener('resize', calcular);
    return () => window.removeEventListener('resize', calcular);
  }, [dims.w, dims.h]);

  const handleFotoSeleccionada = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new window.Image();
    img.onload = () => setFotoBajaResolucion(img.width < 700 || img.height < 850);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const resultado = ev.target?.result as string;
      img.src = resultado;
      setFoto(resultado);
      setZoom(1); setPosX(50); setPosY(50);
    };
    reader.readAsDataURL(file);
  };

  const gestoRef = useRef({ modo: 'ninguno' as 'ninguno' | 'pan' | 'pinch', startX: 0, startY: 0, startPosX: 50, startPosY: 50, startDist: 0, startZoom: 1 });
  const onTouchStart = (e: React.TouchEvent) => {
    if (!foto) return;
    if (e.touches.length === 1) gestoRef.current = { ...gestoRef.current, modo: 'pan', startX: e.touches[0].clientX, startY: e.touches[0].clientY, startPosX: posX, startPosY: posY };
    else if (e.touches.length === 2) gestoRef.current = { ...gestoRef.current, modo: 'pinch', startDist: distanciaEntreToques(e.touches[0], e.touches[1]), startZoom: zoom };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!foto) return;
    e.preventDefault();
    if (gestoRef.current.modo === 'pan' && e.touches.length === 1) {
      const dx = (e.touches[0].clientX - gestoRef.current.startX) / (dims.w * escalaViewport) * 100;
      const dy = (e.touches[0].clientY - gestoRef.current.startY) / (dims.h * escalaViewport) * 100;
      setPosX(Math.max(0, Math.min(100, gestoRef.current.startPosX - dx)));
      setPosY(Math.max(0, Math.min(100, gestoRef.current.startPosY - dy)));
    } else if (gestoRef.current.modo === 'pinch' && e.touches.length === 2) {
      const nuevaDist = distanciaEntreToques(e.touches[0], e.touches[1]);
      setZoom(Math.max(1, Math.min(3, gestoRef.current.startZoom * (nuevaDist / gestoRef.current.startDist))));
    }
  };
  const onTouchEnd = () => { gestoRef.current.modo = 'ninguno'; };

  const arrastreMouseRef = useRef({ activo: false, startX: 0, startY: 0, startPosX: 50, startPosY: 50 });
  const onMouseDown = (e: React.MouseEvent) => { if (foto) arrastreMouseRef.current = { activo: true, startX: e.clientX, startY: e.clientY, startPosX: posX, startPosY: posY }; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!arrastreMouseRef.current.activo) return;
    const dx = (e.clientX - arrastreMouseRef.current.startX) / (dims.w * escalaViewport) * 100;
    const dy = (e.clientY - arrastreMouseRef.current.startY) / (dims.h * escalaViewport) * 100;
    setPosX(Math.max(0, Math.min(100, arrastreMouseRef.current.startPosX - dx)));
    setPosY(Math.max(0, Math.min(100, arrastreMouseRef.current.startPosY - dy)));
  };
  const onMouseUpOrLeave = () => { arrastreMouseRef.current.activo = false; };

  const compartirCard = async () => {
    setProcesando(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const el = cardRef.current;
      if (!el) return;
      // El nodo capturado siempre tiene sus dimensiones fisicas reales (dims.w x dims.h) —
      // el ajuste visual a pantalla vive UNICAMENTE en el contenedor padre (zoom CSS), nunca
      // en este nodo, asi que html2canvas mide exactamente lo que se ve.
      const canvas = await html2canvas(el, { backgroundColor: null, scale: 2, useCORS: true, width: dims.w, height: dims.h });
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const file = new File([blob], `forge-${disciplina}-${Date.now()}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Mi entreno con Forge' });
      } else {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (err) {
      console.error('Error compartiendo Card:', err);
    } finally {
      setProcesando(false);
    }
  };

  const filtroActivo = FILTROS.find(f => f.id === filtro) || FILTROS[0];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, flexDirection: 'column', gap: 12, padding: 16, fontFamily: "'DM Sans', sans-serif", overflowY: 'auto' }}>
      {onClose && (
        <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: '#141414', border: '1px solid #232323', borderRadius: 100, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}>
          <X size={17} color={C.ink} />
        </button>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {(Object.keys(FORMATOS) as Formato[]).map(f => (
          <button key={f} onClick={() => setFormato(f)} style={{
            background: formato === f ? C.accent : '#141414', color: formato === f ? '#fff' : C.muted,
            border: `1px solid ${formato === f ? C.accent : '#232323'}`, borderRadius: 100, padding: '7px 16px',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            {FORMATOS[f].label}
          </button>
        ))}
      </div>

      {/* Contenedor de ajuste visual: SOLO aqui vive el escalado a pantalla (zoom CSS,
          no transform), asi el nodo hijo (cardRef) siempre tiene su tamaño fisico real */}
      <div style={{ width: dims.w * escalaViewport, height: dims.h * escalaViewport, overflow: 'hidden', borderRadius: 20, boxShadow: '0 40px 100px -30px rgba(0,0,0,0.7)' }}>
        <div ref={cardRef}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUpOrLeave} onMouseLeave={onMouseUpOrLeave}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{
            width: dims.w, height: dims.h, zoom: escalaViewport as any, position: 'relative', overflow: 'hidden',
            background: `linear-gradient(155deg, #161616 0%, ${C.bg} 60%)`,
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
            cursor: foto ? 'grab' : 'default', touchAction: foto ? 'none' : 'auto',
          }}>
          {foto && (
            <img src={foto} draggable={false} style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
              objectPosition: `${posX}% ${posY}%`, transform: `scale(${zoom})`, transformOrigin: 'center',
              filter: filtroActivo.css, zIndex: 0, userSelect: 'none', pointerEvents: 'none',
            }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(5,5,5,0.55) 62%, rgba(5,5,5,0.94) 100%)', zIndex: 1 }} />

          {!foto && (
            <button onClick={() => fileInputRef.current?.click()} style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 2,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              background: 'none', border: `1.5px dashed ${C.muted}`, borderRadius: 16, padding: '24px 32px', cursor: 'pointer',
            }}>
              <ImageIcon size={26} color={C.muted} />
              <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 600 }}>Añadir foto</span>
            </button>
          )}

          {disciplina === 'carrera' ? <RunningOverlay data={running || {}} /> : <CrossfitOverlay data={crossfit || {}} />}

          <div style={{ position: 'relative', zIndex: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 26px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <img src="/logo-forge.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain', filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))', display: 'block' }} />
              <span style={{ color: C.accent, fontSize: 12, fontWeight: 800, letterSpacing: 2.5 }}>FORGE</span>
            </div>
            <span style={{ color: C.muted, fontSize: 10, letterSpacing: 0.3 }}>{fecha}</span>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFotoSeleccionada} style={{ display: 'none' }} />

      {fotoBajaResolucion && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2A1F0D', border: '1px solid #FF6B0050', borderRadius: 10, padding: '8px 14px', maxWidth: dims.w * escalaViewport }}>
          <AlertTriangle size={14} color={C.accent} />
          <span style={{ color: C.ink, fontSize: 12 }}>Foto de baja resolución.</span>
        </div>
      )}

      {foto && (
        <>
          <p style={{ color: C.muted, fontSize: 11.5, textAlign: 'center' }}>Arrastra para mover · pellizca para zoom</p>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', maxWidth: dims.w * escalaViewport, paddingBottom: 2 }}>
            {FILTROS.map(f => (
              <button key={f.id} onClick={() => setFiltro(f.id)} style={{
                flexShrink: 0, background: filtro === f.id ? C.accent : '#141414', color: filtro === f.id ? '#fff' : C.muted,
                border: `1px solid ${filtro === f.id ? C.accent : '#232323'}`, borderRadius: 100, padding: '6px 14px',
                fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {foto && (
          <button onClick={() => fileInputRef.current?.click()} style={{
            display: 'flex', alignItems: 'center', gap: 8, background: '#141414', color: C.ink, border: `1px solid #232323`,
            borderRadius: 100, padding: '13px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            <Upload size={16} />
            Cambiar
          </button>
        )}
        <button onClick={compartirCard} disabled={procesando || !foto} style={{
          display: 'flex', alignItems: 'center', gap: 8, background: foto ? C.accent : '#333', color: '#fff', border: 'none',
          borderRadius: 100, padding: '13px 30px', fontSize: 14, fontWeight: 700, cursor: foto ? 'pointer' : 'not-allowed',
          boxShadow: foto ? `0 10px 30px -8px ${C.accent}70` : 'none', opacity: foto ? 1 : 0.5,
        }}>
          <Share2 size={16} />
          {procesando ? 'Preparando...' : 'Compartir'}
        </button>
      </div>
    </div>
  );
}