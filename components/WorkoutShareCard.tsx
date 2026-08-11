import { useState, useRef } from 'react';
import { Download, X, Upload, Image as ImageIcon, AlertTriangle } from 'lucide-react';

const C = {
  bg: '#050505',
  ink: '#F5F2EC',
  muted: '#7A756E',
  accent: '#FF6B00',
};

type Disciplina = 'carrera' | 'crossfit';

interface RunningData {
  distancia?: string;    // "9" (km)
  tiempo?: string;       // "44:32"
  ritmo?: string;        // "5:15" (/km)
  fcMedia?: string;
  fcMax?: string;
  desnivel?: string;
  intervalos?: string;   // "5x1200" — si es sesion de series
  etiquetaTipo?: string; // "RUN" | "INTERVALS" | "LONG RUN" | "TEMPO" | "RACE"
}

interface CrossfitData {
  nombreWod?: string;
  resultado?: string;    // tiempo o "21-15-9"
  tipo?: string;         // "RX", "Scaled"
  movimientos?: string;
}

interface WorkoutShareCardProps {
  disciplina: Disciplina;
  fecha: string;
  running?: RunningData;
  crossfit?: CrossfitData;
  onClose?: () => void;
}

// ============================================================
// Resultado principal — NUNCA vacio si hay datos utilizables.
// Prioridad determinista, sin inventar ningun dato.
// ============================================================
function calcularResultadoPrincipalRunning(data: RunningData): { principal: string; secundario: string | null } {
  if (data.intervalos) {
    return { principal: `${data.intervalos.toUpperCase()} M`, secundario: data.ritmo ? `${data.ritmo} /KM` : null };
  }
  if (data.distancia && data.tiempo) {
    return { principal: `${data.distancia} KM`, secundario: data.ritmo ? `${data.ritmo} /KM` : data.tiempo };
  }
  if (data.distancia && data.ritmo) {
    return { principal: `${data.distancia} KM`, secundario: `${data.ritmo} /KM` };
  }
  if (data.distancia) {
    return { principal: `${data.distancia} KM`, secundario: null };
  }
  if (data.tiempo) {
    return { principal: data.tiempo, secundario: data.ritmo ? `${data.ritmo} /KM` : null };
  }
  return { principal: '', secundario: null };
}

function calcularEtiquetaRunning(data: RunningData): string {
  if (data.etiquetaTipo) return data.etiquetaTipo;
  if (data.intervalos) return 'INTERVALS';
  return 'RUN';
}

// ============================================================
// Overlays
// ============================================================
function RunningOverlay({ data }: { data: RunningData }) {
  const { principal, secundario } = calcularResultadoPrincipalRunning(data);
  const etiqueta = calcularEtiquetaRunning(data);

  // Maximo 3 metricas secundarias, prioridad: distancia total (si no es ya el principal) > FC > FC max > D+
  const metricasSecundarias = [
    data.intervalos && data.distancia && { valor: `${data.distancia} KM`, label: null },
    data.fcMedia && { valor: `${data.fcMedia} FC`, label: null },
    data.fcMax && { valor: `${data.fcMax} MAX`, label: null },
    data.desnivel && { valor: `${data.desnivel} D+`, label: null },
  ].filter(Boolean).slice(0, 3) as { valor: string; label: null }[];

  return (
    <div style={{ position: 'relative', zIndex: 3, padding: '0 30px 30px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ color: C.accent, fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>{etiqueta}</p>
      {principal ? (
        <p style={{ color: C.ink, fontSize: 48, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>{principal}</p>
      ) : (
        <p style={{ color: C.muted, fontSize: 16, fontStyle: 'italic' }}>Añade los datos de tu entreno</p>
      )}
      {secundario && (
        <p style={{ color: C.ink, fontSize: 20, fontWeight: 700, fontFamily: 'Georgia, serif', opacity: 0.9, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>{secundario}</p>
      )}
      {metricasSecundarias.length > 0 && (
        <p style={{ color: C.muted, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.5, marginTop: 4 }}>
          {metricasSecundarias.map(m => m.valor).join(' · ')}
        </p>
      )}
    </div>
  );
}

function CrossfitOverlay({ data }: { data: CrossfitData }) {
  const movimientosTruncados = data.movimientos && data.movimientos.length > 70
    ? data.movimientos.slice(0, 67).trim() + '...'
    : data.movimientos;

  return (
    <div style={{ position: 'relative', zIndex: 3, padding: '0 30px 30px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ color: C.accent, fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>WOD{data.tipo ? ` · ${data.tipo.toUpperCase()}` : ''}</p>
      <p style={{ color: C.ink, fontSize: 24, fontWeight: 800, marginTop: 2, textShadow: '0 2px 16px rgba(0,0,0,0.6)', lineHeight: 1.15 }}>{data.nombreWod || 'Entreno de hoy'}</p>
      {data.resultado ? (
        <p style={{ color: C.ink, fontSize: 48, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, marginTop: 4, textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>{data.resultado}</p>
      ) : (
        <p style={{ color: C.muted, fontSize: 16, fontStyle: 'italic', marginTop: 6 }}>Añade tu resultado</p>
      )}
      {movimientosTruncados && (
        <p style={{ color: C.muted, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{movimientosTruncados}</p>
      )}
    </div>
  );
}

// ============================================================
// Componente principal
// ============================================================
export default function WorkoutShareCard({ disciplina, fecha, running, crossfit, onClose }: WorkoutShareCardProps) {
  const [foto, setFoto] = useState<string | null>(null);
  const [fotoBajaResolucion, setFotoBajaResolucion] = useState(false);
  const [posicionY, setPosicionY] = useState(50);
  const [descargando, setDescargando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFotoSeleccionada = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new window.Image();
    img.onload = () => {
      // La Card exporta a scale:2 sobre 400x500 -> ideal minimo 800x1000
      setFotoBajaResolucion(img.width < 700 || img.height < 850);
    };
    const reader = new FileReader();
    reader.onload = (ev) => {
      const resultado = ev.target?.result as string;
      img.src = resultado;
      setFoto(resultado);
    };
    reader.readAsDataURL(file);
  };

  const descargarCard = async () => {
    setDescargando(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const el = document.getElementById('workout-share-card-export');
      if (!el) return;
      const canvas = await html2canvas(el, { backgroundColor: null, scale: 2, useCORS: true });
      const link = document.createElement('a');
      link.download = `forge-${disciplina}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, flexDirection: 'column', gap: 14, padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
      {onClose && (
        <button onClick={onClose} style={{ position: 'absolute', top: 24, right: 24, background: '#141414', border: '1px solid #232323', borderRadius: 100, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={18} color={C.ink} />
        </button>
      )}

      <div id="workout-share-card-export" style={{
        width: 400, height: 500, borderRadius: 24, position: 'relative', overflow: 'hidden',
        background: foto ? `url(${foto})` : `linear-gradient(155deg, #161616 0%, ${C.bg} 60%)`,
        backgroundSize: 'cover', backgroundPosition: `center ${posicionY}%`,
        boxShadow: '0 40px 100px -30px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
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

        <div style={{ position: 'relative', zIndex: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 30px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo-forge.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain', filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))' }} />
            <span style={{ color: C.accent, fontSize: 13, fontWeight: 800, letterSpacing: 3 }}>FORGE</span>
          </div>
          <span style={{ color: C.muted, fontSize: 10.5, letterSpacing: 0.4 }}>{fecha}</span>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFotoSeleccionada} style={{ display: 'none' }} />

      {fotoBajaResolucion && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2A1F0D', border: '1px solid #FF6B0050', borderRadius: 10, padding: '8px 14px', maxWidth: 400 }}>
          <AlertTriangle size={14} color={C.accent} />
          <span style={{ color: C.ink, fontSize: 12 }}>Foto de baja resolución — puede perder calidad al ampliar.</span>
        </div>
      )}

      {foto && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 400 }}>
          <span style={{ color: C.muted, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>Encuadre</span>
          <input type="range" min={0} max={100} value={posicionY} onChange={(e) => setPosicionY(Number(e.target.value))}
            style={{ flex: 1, accentColor: C.accent }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {foto && (
          <button onClick={() => fileInputRef.current?.click()} style={{
            display: 'flex', alignItems: 'center', gap: 8, background: '#141414', color: C.ink, border: `1px solid #232323`,
            borderRadius: 100, padding: '14px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            <Upload size={16} />
            Cambiar foto
          </button>
        )}
        <button onClick={descargarCard} disabled={descargando || !foto} style={{
          display: 'flex', alignItems: 'center', gap: 8, background: foto ? C.accent : '#333', color: '#fff', border: 'none',
          borderRadius: 100, padding: '14px 32px', fontSize: 14, fontWeight: 700, cursor: foto ? 'pointer' : 'not-allowed',
          boxShadow: foto ? `0 10px 30px -8px ${C.accent}70` : 'none', opacity: foto ? 1 : 0.5,
        }}>
          <Download size={16} />
          {descargando ? 'Descargando...' : 'Descargar imagen'}
        </button>
      </div>
    </div>
  );
}