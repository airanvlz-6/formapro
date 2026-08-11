import { useState, useRef } from 'react';
import { Download, X, Upload, Image as ImageIcon } from 'lucide-react';

const C = {
  bg: '#050505',
  ink: '#F5F2EC',
  muted: '#7A756E',
  accent: '#FF6B00',
};

type Disciplina = 'carrera' | 'crossfit';

interface RunningData {
  distancia?: string;
  tiempo?: string;
  ritmo?: string;
  fcMedia?: string;
  desnivel?: string;
}

interface CrossfitData {
  nombreWod?: string;
  resultado?: string;
  tipo?: string; // "RX", "Scaled", etc
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
// Overlay de datos — HUD deportivo real, flota sobre la foto
// ============================================================
function RunningOverlay({ data }: { data: RunningData }) {
  // Prioridad fija: ritmo > tiempo > FC > D+, maximo 3 secundarias para no saturar la tarjeta
  const secundarias = [
    data.ritmo && { valor: data.ritmo, label: 'Ritmo /km' },
    data.tiempo && { valor: data.tiempo, label: 'Tiempo' },
    data.fcMedia && { valor: data.fcMedia, label: 'FC media' },
    data.desnivel && { valor: data.desnivel, label: 'D+' },
  ].filter(Boolean).slice(0, 3) as { valor: string; label: string }[];

  return (
    <div style={{ position: 'relative', zIndex: 3, padding: '0 30px 30px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <span style={{ color: C.ink, fontSize: 64, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>{data.distancia || '—'}</span>
        <span style={{ color: C.accent, fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>KM</span>
      </div>
      <div style={{ display: 'flex', gap: 22, marginTop: 6 }}>
        {secundarias.map((s, i) => (
          <div key={i}>
            <p style={{ color: C.ink, fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>{s.valor}</p>
            <p style={{ color: C.muted, fontSize: 9.5, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CrossfitOverlay({ data }: { data: CrossfitData }) {
  const movimientosTruncados = data.movimientos && data.movimientos.length > 70
    ? data.movimientos.slice(0, 67).trim() + '...'
    : data.movimientos;

  return (
    <div style={{ position: 'relative', zIndex: 3, padding: '0 30px 30px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ color: C.accent, fontSize: 12, fontWeight: 800, letterSpacing: 2, marginBottom: 4 }}>{(data.tipo || 'WOD').toUpperCase()}</p>
      <p style={{ color: C.ink, fontSize: 26, fontWeight: 800, marginBottom: 8, textShadow: '0 2px 16px rgba(0,0,0,0.6)', lineHeight: 1.15 }}>{data.nombreWod || 'Entreno de hoy'}</p>
      <p style={{ color: C.ink, fontSize: 52, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>{data.resultado || '—'}</p>
      {movimientosTruncados && (
        <p style={{ color: C.muted, fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>{movimientosTruncados}</p>
      )}
    </div>
  );
}

// ============================================================
// Componente principal
// ============================================================
export default function WorkoutShareCard({ disciplina, fecha, running, crossfit, onClose }: WorkoutShareCardProps) {
  const [foto, setFoto] = useState<string | null>(null);
  const [posicionY, setPosicionY] = useState(50); // 0-100, centro por defecto
  const [descargando, setDescargando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFotoSeleccionada = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setFoto(ev.target?.result as string);
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, flexDirection: 'column', gap: 18, padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
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
        {/* Gradiente inferior para legibilidad del texto sobre cualquier foto */}
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