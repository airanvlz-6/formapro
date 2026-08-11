import { useState, useRef, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, AlertTriangle, Share2, ZoomIn, Move } from 'lucide-react';

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
  if (data.intervalos) {
    return { principal: `${data.intervalos.toUpperCase()} M`, secundario: data.ritmo ? `${data.ritmo} /KM` : null };
  }
  if (data.distancia && data.tiempo) {
    return { principal: `${data.distancia} KM`, secundario: data.ritmo ? `${data.ritmo} /KM` : data.tiempo };
  }
  if (data.distancia && data.ritmo) {
    return { principal: `${data.distancia} KM`, secundario: `${data.ritmo} /KM` };
  }
  if (data.distancia) return { principal: `${data.distancia} KM`, secundario: null };
  if (data.tiempo) return { principal: data.tiempo, secundario: data.ritmo ? `${data.ritmo} /KM` : null };
  return { principal: '', secundario: null };
}

function calcularEtiquetaRunning(data: RunningData): string {
  if (data.etiquetaTipo) return data.etiquetaTipo;
  if (data.intervalos) return 'INTERVALS';
  return 'RUN';
}

function RunningOverlay({ data, escala }: { data: RunningData; escala: number }) {
  const { principal, secundario } = calcularResultadoPrincipalRunning(data);
  const etiqueta = calcularEtiquetaRunning(data);
  const metricasSecundarias = [
    data.intervalos && data.distancia && { valor: `${data.distancia} KM` },
    data.fcMedia && { valor: `${data.fcMedia} FC` },
    data.fcMax && { valor: `${data.fcMax} MAX` },
    data.desnivel && { valor: `${data.desnivel} D+` },
  ].filter(Boolean).slice(0, 3) as { valor: string }[];

  return (
    <div style={{ position: 'relative', zIndex: 3, padding: `0 ${30*escala}px ${30*escala}px`, display: 'flex', flexDirection: 'column', gap: 6*escala }}>
      <p style={{ color: C.accent, fontSize: 12*escala, fontWeight: 800, letterSpacing: 2 }}>{etiqueta}</p>
      {principal ? (
        <p style={{ color: C.ink, fontSize: 48*escala, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>{principal}</p>
      ) : (
        <p style={{ color: C.muted, fontSize: 16*escala, fontStyle: 'italic' }}>Añade los datos de tu entreno</p>
      )}
      {secundario && <p style={{ color: C.ink, fontSize: 20*escala, fontWeight: 700, fontFamily: 'Georgia, serif', opacity: 0.9, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>{secundario}</p>}
      {metricasSecundarias.length > 0 && (
        <p style={{ color: C.muted, fontSize: 12.5*escala, fontWeight: 600, letterSpacing: 0.5, marginTop: 4*escala }}>{metricasSecundarias.map(m => m.valor).join(' · ')}</p>
      )}
    </div>
  );
}

function CrossfitOverlay({ data, escala }: { data: CrossfitData; escala: number }) {
  const movimientosTruncados = data.movimientos && data.movimientos.length > 70 ? data.movimientos.slice(0, 67).trim() + '...' : data.movimientos;
  return (
    <div style={{ position: 'relative', zIndex: 3, padding: `0 ${30*escala}px ${30*escala}px`, display: 'flex', flexDirection: 'column', gap: 4*escala }}>
      <p style={{ color: C.accent, fontSize: 12*escala, fontWeight: 800, letterSpacing: 2 }}>WOD{data.tipo ? ` · ${data.tipo.toUpperCase()}` : ''}</p>
      <p style={{ color: C.ink, fontSize: 24*escala, fontWeight: 800, marginTop: 2, textShadow: '0 2px 16px rgba(0,0,0,0.6)', lineHeight: 1.15 }}>{data.nombreWod || 'Entreno de hoy'}</p>
      {data.resultado ? (
        <p style={{ color: C.ink, fontSize: 48*escala, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, marginTop: 4, textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>{data.resultado}</p>
      ) : (
        <p style={{ color: C.muted, fontSize: 16*escala, fontStyle: 'italic', marginTop: 6 }}>Añade tu resultado</p>
      )}
      {movimientosTruncados && <p style={{ color: C.muted, fontSize: 12*escala, marginTop: 8, lineHeight: 1.5 }}>{movimientosTruncados}</p>}
    </div>
  );
}

export default function WorkoutShareCard({ disciplina, fecha, running, crossfit, onClose }: WorkoutShareCardProps) {
  const [foto, setFoto] = useState<string | null>(null);
  const [fotoBajaResolucion, setFotoBajaResolucion] = useState(false);
  const [formato, setFormato] = useState<Formato>('9:16');
  const [zoom, setZoom] = useState(1);
  const [posX, setPosX] = useState(50);
  const [posY, setPosY] = useState(50);
  const [modoAjuste, setModoAjuste] = useState<'zoom' | 'mover'>('mover');
  const [procesando, setProcesando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dims = FORMATOS[formato];
  const escala = dims.w / 480;

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

  // Arrastre táctil/mouse para mover la foto dentro del marco
  const arrastreRef = useRef<{ activo: boolean; startX: number; startY: number; startPosX: number; startPosY: number }>({ activo: false, startX: 0, startY: 0, startPosX: 50, startPosY: 50 });

  const iniciarArrastre = (clientX: number, clientY: number) => {
    if (modoAjuste !== 'mover') return;
    arrastreRef.current = { activo: true, startX: clientX, startY: clientY, startPosX: posX, startPosY: posY };
  };
  const moverArrastre = (clientX: number, clientY: number) => {
    if (!arrastreRef.current.activo) return;
    const dx = (clientX - arrastreRef.current.startX) / dims.w * 100;
    const dy = (clientY - arrastreRef.current.startY) / dims.h * 100;
    setPosX(Math.max(0, Math.min(100, arrastreRef.current.startPosX - dx)));
    setPosY(Math.max(0, Math.min(100, arrastreRef.current.startPosY - dy)));
  };
  const terminarArrastre = () => { arrastreRef.current.activo = false; };

  // FIX: navigator.share() con fallback — en iPhone/Safari esto abre el share sheet nativo
  // (Guardar imagen, WhatsApp, Instagram, Mensajes, AirDrop...) en vez de una descarga silenciosa
  // cuyo destino no es evidente para el usuario.
  const compartirCard = async () => {
    setProcesando(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const el = document.getElementById('workout-share-card-export');
      if (!el) return;
      const canvas = await html2canvas(el, { backgroundColor: null, scale: 2, useCORS: true, width: dims.w, height: dims.h });

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const file = new File([blob], `forge-${disciplina}-${Date.now()}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Mi entreno con Forge' });
      } else {
        // Fallback: abrir la imagen en una nueva pestaña para que el usuario la guarde manualmente
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (err) {
      console.error('Error compartiendo Card:', err);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, flexDirection: 'column', gap: 14, padding: 24, fontFamily: "'DM Sans', sans-serif", overflowY: 'auto' }}>
      {onClose && (
        <button onClick={onClose} style={{ position: 'absolute', top: 24, right: 24, background: '#141414', border: '1px solid #232323', borderRadius: 100, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}>
          <X size={18} color={C.ink} />
        </button>
      )}

      {/* Selector de formato */}
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

      <div id="workout-share-card-export"
        onMouseDown={(e) => iniciarArrastre(e.clientX, e.clientY)}
        onMouseMove={(e) => moverArrastre(e.clientX, e.clientY)}
        onMouseUp={terminarArrastre}
        onMouseLeave={terminarArrastre}
        onTouchStart={(e) => iniciarArrastre(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => moverArrastre(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={terminarArrastre}
        style={{
          width: dims.w, height: dims.h, borderRadius: 20, position: 'relative', overflow: 'hidden',
          background: `linear-gradient(155deg, #161616 0%, ${C.bg} 60%)`,
          boxShadow: '0 40px 100px -30px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          cursor: foto && modoAjuste === 'mover' ? 'grab' : 'default',
          touchAction: 'none',
        }}>
        {/* FIX: la foto respeta su aspect ratio original (object-fit: cover controlado por el
            usuario via zoom/posicion), en vez de forzar un recorte automatico agresivo */}
        {foto && (
          <img src={foto} draggable={false} style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            objectPosition: `${posX}% ${posY}%`, transform: `scale(${zoom})`, transformOrigin: 'center',
            zIndex: 0, userSelect: 'none', pointerEvents: 'none',
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

        {disciplina === 'carrera' ? <RunningOverlay data={running || {}} escala={escala} /> : <CrossfitOverlay data={crossfit || {}} escala={escala} />}

        <div style={{ position: 'relative', zIndex: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${14*escala}px ${30*escala}px ${22*escala}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8*escala }}>
            <img src="/logo-forge.png" alt="" style={{ width: 22*escala, height: 22*escala, objectFit: 'contain', filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))' }} />
            <span style={{ color: C.accent, fontSize: 13*escala, fontWeight: 800, letterSpacing: 3 }}>FORGE</span>
          </div>
          <span style={{ color: C.muted, fontSize: 10.5*escala, letterSpacing: 0.4 }}>{fecha}</span>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFotoSeleccionada} style={{ display: 'none' }} />

      {fotoBajaResolucion && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2A1F0D', border: '1px solid #FF6B0050', borderRadius: 10, padding: '8px 14px', maxWidth: dims.w }}>
          <AlertTriangle size={14} color={C.accent} />
          <span style={{ color: C.ink, fontSize: 12 }}>Foto de baja resolución — puede perder calidad al ampliar.</span>
        </div>
      )}

      {foto && (
        <>
          {/* Controles de ajuste: mover o zoom */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setModoAjuste('mover')} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: modoAjuste === 'mover' ? C.accent : '#141414',
              color: modoAjuste === 'mover' ? '#fff' : C.muted, border: `1px solid ${modoAjuste === 'mover' ? C.accent : '#232323'}`,
              borderRadius: 100, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              <Move size={13} /> Mover
            </button>
            <button onClick={() => setModoAjuste('zoom')} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: modoAjuste === 'zoom' ? C.accent : '#141414',
              color: modoAjuste === 'zoom' ? '#fff' : C.muted, border: `1px solid ${modoAjuste === 'zoom' ? C.accent : '#232323'}`,
              borderRadius: 100, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              <ZoomIn size={13} /> Zoom
            </button>
          </div>
          {modoAjuste === 'zoom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: dims.w }}>
              <span style={{ color: C.muted, fontSize: 11, fontWeight: 600 }}>1x</span>
              <input type="range" min={1} max={2.5} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ flex: 1, accentColor: C.accent }} />
              <span style={{ color: C.muted, fontSize: 11, fontWeight: 600 }}>2.5x</span>
            </div>
          )}
          {modoAjuste === 'mover' && (
            <p style={{ color: C.muted, fontSize: 11.5, textAlign: 'center' }}>Arrastra la foto para reencuadrarla</p>
          )}
        </>
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
        <button onClick={compartirCard} disabled={procesando || !foto} style={{
          display: 'flex', alignItems: 'center', gap: 8, background: foto ? C.accent : '#333', color: '#fff', border: 'none',
          borderRadius: 100, padding: '14px 32px', fontSize: 14, fontWeight: 700, cursor: foto ? 'pointer' : 'not-allowed',
          boxShadow: foto ? `0 10px 30px -8px ${C.accent}70` : 'none', opacity: foto ? 1 : 0.5,
        }}>
          <Share2 size={16} />
          {procesando ? 'Preparando...' : 'Compartir'}
        </button>
      </div>
    </div>
  );
}