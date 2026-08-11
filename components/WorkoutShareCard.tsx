import { useState, useRef, useEffect, useCallback } from 'react';
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
  '9:16': { w: 1080, h: 1920, label: 'Story' },
  '4:5': { w: 1080, h: 1350, label: 'Feed' },
  '1:1': { w: 1080, h: 1080, label: 'Cuadrado' },
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

function distanciaEntreToques(t0: React.Touch, t1: React.Touch) {
  return Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
}

// FORGE SHARE CARD — v3: renderizado sobre <canvas> real en vez de CSS transforms anidados.
// CAUSA RAIZ del bug de "efecto lupa": los transforms CSS anidados (escala del contenedor
// responsivo x escala/posicion de la foto) se comportaban de forma inconsistente entre lo que
// el navegador pintaba en pantalla y lo que html2canvas capturaba al medir el DOM. Un <canvas>
// dibuja pixeles reales de forma identica siempre — WYSIWYG genuino, sin ambiguedad de layout.
export default function WorkoutShareCard({ disciplina, fecha, running, crossfit, onClose }: WorkoutShareCardProps) {
  const [imagenObj, setImagenObj] = useState<HTMLImageElement | null>(null);
  const [fotoBajaResolucion, setFotoBajaResolucion] = useState(false);
  const [formato, setFormato] = useState<Formato>('9:16');
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0); // desplazamiento en px, a escala del canvas real (1080 ancho)
  const [offsetY, setOffsetY] = useState(0);
  const [procesando, setProcesando] = useState(false);
  const [escalaViewport, setEscalaViewport] = useState(0.3);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dims = FORMATOS[formato];
  const escalaTexto = dims.w / 1080; // escala de tipografia relativa al canvas base 1080 de ancho

  useEffect(() => {
    const calcular = () => {
      const maxAlto = window.innerHeight - 260;
      const maxAncho = Math.min(window.innerWidth - 48, 460);
      const factor = Math.min(maxAncho / dims.w, maxAlto / dims.h);
      setEscalaViewport(factor);
    };
    calcular();
    window.addEventListener('resize', calcular);
    return () => window.removeEventListener('resize', calcular);
  }, [dims.w, dims.h]);

  const handleFotoSeleccionada = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new window.Image();
      img.onload = () => {
        setFotoBajaResolucion(img.width < 1080 || img.height < 1080);
        setImagenObj(img);
        setZoom(1); setOffsetX(0); setOffsetY(0);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Dibuja la foto (cover + zoom + offset) en las dimensiones REALES del canvas (1080x...).
  // Esta misma funcion se usa tanto para la vista previa como para la exportacion final —
  // garantiza que lo que se ve es exactamente lo que se exporta.
  const dibujarFoto = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!imagenObj) return;
    const coverBase = Math.max(dims.w / imagenObj.width, dims.h / imagenObj.height);
    const escalaFinal = coverBase * zoom;
    const anchoDibujo = imagenObj.width * escalaFinal;
    const altoDibujo = imagenObj.height * escalaFinal;
    const cx = (dims.w - anchoDibujo) / 2 + offsetX;
    const cy = (dims.h - altoDibujo) / 2 + offsetY;
    ctx.drawImage(imagenObj, cx, cy, anchoDibujo, altoDibujo);
  }, [imagenObj, zoom, offsetX, offsetY, dims.w, dims.h]);

  // Dibuja la Card COMPLETA (foto + gradiente + overlay de texto) en un contexto dado.
  // Reutilizada IDENTICA tanto para la vista previa en pantalla como para la exportacion final —
  // elimina el bug de "el texto no se ve hasta compartir" causado por tener dos funciones distintas.
  const dibujarCardCompleta = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, dims.w, dims.h);
    ctx.fillStyle = '#161616';
    ctx.fillRect(0, 0, dims.w, dims.h);
    dibujarFoto(ctx);

    const grad = ctx.createLinearGradient(0, 0, 0, dims.h);
    grad.addColorStop(0, 'rgba(5,5,5,0)');
    grad.addColorStop(0.3, 'rgba(5,5,5,0)');
    grad.addColorStop(0.62, 'rgba(5,5,5,0.55)');
    grad.addColorStop(1, 'rgba(5,5,5,0.94)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, dims.w, dims.h);

    const px = 66 * escalaTexto;
    // FIX: en Story (1080x1920), escalaTexto=1 pero la altura es mucho mayor que en Feed/Cuadrado,
    // haciendo que el bloque de texto (posicionado a una distancia fija del borde inferior) se vea
    // proporcionalmente pequeño y pegado a la esquina. Anclamos la posicion vertical de forma
    // proporcional a la ALTURA real del formato, no a un valor fijo en pixeles.
    const anclaInferior = dims.h * 0.14; // ~14% de la altura total, consistente en todos los formatos
    let y = dims.h - anclaInferior;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    if (disciplina === 'carrera') {
      const { principal, secundario } = calcularResultadoPrincipalRunning(running || {});
      const etiqueta = calcularEtiquetaRunning(running || {});
      const metricas = [
        running?.intervalos && running?.distancia && `${running.distancia} KM`,
        running?.fcMedia && `${running.fcMedia} FC`,
        running?.fcMax && `${running.fcMax} MAX`,
        running?.desnivel && `${running.desnivel} D+`,
      ].filter(Boolean).slice(0, 3) as string[];

      y = dims.h - anclaInferior - (metricas.length > 0 ? 30 * escalaTexto : 0);
      ctx.fillStyle = C.accent;
      ctx.font = `800 ${27 * escalaTexto}px 'DM Sans', sans-serif`;
      ctx.fillText(etiqueta, px, y);
      y += 68 * escalaTexto;
      ctx.fillStyle = C.ink;
      ctx.font = `800 ${100 * escalaTexto}px Georgia, serif`;
      ctx.fillText(principal || '—', px, y);
      if (secundario) {
        y += 44 * escalaTexto;
        ctx.font = `700 ${42 * escalaTexto}px Georgia, serif`;
        ctx.globalAlpha = 0.9;
        ctx.fillText(secundario, px, y);
        ctx.globalAlpha = 1;
      }
      if (metricas.length > 0) {
        y += 40 * escalaTexto;
        ctx.fillStyle = C.muted;
        ctx.font = `600 ${26 * escalaTexto}px 'DM Sans', sans-serif`;
        ctx.fillText(metricas.join(' · '), px, y);
      }
    } else {
      const movimientos = crossfit?.movimientos && crossfit.movimientos.length > 70 ? crossfit.movimientos.slice(0, 67).trim() + '...' : crossfit?.movimientos;
      y = dims.h - anclaInferior - 50 * escalaTexto;
      ctx.fillStyle = C.accent;
      ctx.font = `800 ${27 * escalaTexto}px 'DM Sans', sans-serif`;
      ctx.fillText(`WOD${crossfit?.tipo ? ` · ${crossfit.tipo.toUpperCase()}` : ''}`, px, y);
      y += 56 * escalaTexto;
      ctx.fillStyle = C.ink;
      ctx.font = `800 ${50 * escalaTexto}px 'DM Sans', sans-serif`;
      ctx.fillText(crossfit?.nombreWod || 'Entreno de hoy', px, y);
      y += 90 * escalaTexto;
      ctx.font = `800 ${100 * escalaTexto}px Georgia, serif`;
      ctx.fillText(crossfit?.resultado || '—', px, y);
      if (movimientos) {
        y += 48 * escalaTexto;
        ctx.fillStyle = C.muted;
        ctx.font = `500 ${26 * escalaTexto}px 'DM Sans', sans-serif`;
        ctx.fillText(movimientos, px, y);
      }
    }

    const footerY = dims.h - (dims.h * 0.035);
    ctx.fillStyle = C.accent;
    ctx.font = `800 ${28 * escalaTexto}px 'DM Sans', sans-serif`;
    ctx.fillText('FORGE', px, footerY);
    ctx.fillStyle = C.muted;
    ctx.font = `500 ${22 * escalaTexto}px 'DM Sans', sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(fecha, dims.w - px, footerY);
    ctx.textAlign = 'left';
  }, [dibujarFoto, dims.w, dims.h, escalaTexto, disciplina, running, crossfit, fecha]);

  // Redibuja el canvas de vista previa cada vez que cambia algo relevante — usa la MISMA funcion
  // que la exportacion final, garantizando coherencia total entre preview y resultado compartido.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    dibujarCardCompleta(ctx);
  }, [dibujarCardCompleta, dims.w, dims.h]);

  // Limitar el offset para que la foto no se pueda arrastrar fuera del marco
  const limitarOffset = useCallback((ox: number, oy: number, z: number) => {
    if (!imagenObj) return { ox, oy };
    const coverBase = Math.max(dims.w / imagenObj.width, dims.h / imagenObj.height);
    const escalaFinal = coverBase * z;
    const anchoDibujo = imagenObj.width * escalaFinal;
    const altoDibujo = imagenObj.height * escalaFinal;
    const maxOffsetX = Math.max(0, (anchoDibujo - dims.w) / 2);
    const maxOffsetY = Math.max(0, (altoDibujo - dims.h) / 2);
    return { ox: Math.max(-maxOffsetX, Math.min(maxOffsetX, ox)), oy: Math.max(-maxOffsetY, Math.min(maxOffsetY, oy)) };
  }, [imagenObj, dims.w, dims.h]);

  // Gestos tactiles: coordenadas de pantalla -> pixeles reales del canvas (dividiendo por escalaViewport)
  const gestoRef = useRef({ modo: 'ninguno' as 'ninguno' | 'pan' | 'pinch', startX: 0, startY: 0, startOffX: 0, startOffY: 0, startDist: 0, startZoom: 1 });

  const onTouchStart = (e: React.TouchEvent) => {
    if (!imagenObj) return;
    if (e.touches.length === 1) {
      gestoRef.current = { ...gestoRef.current, modo: 'pan', startX: e.touches[0].clientX, startY: e.touches[0].clientY, startOffX: offsetX, startOffY: offsetY };
    } else if (e.touches.length === 2) {
      gestoRef.current = { ...gestoRef.current, modo: 'pinch', startDist: distanciaEntreToques(e.touches[0], e.touches[1]), startZoom: zoom };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!imagenObj) return;
    e.preventDefault();
    if (gestoRef.current.modo === 'pan' && e.touches.length === 1) {
      const dx = (e.touches[0].clientX - gestoRef.current.startX) / escalaViewport;
      const dy = (e.touches[0].clientY - gestoRef.current.startY) / escalaViewport;
      const { ox, oy } = limitarOffset(gestoRef.current.startOffX + dx, gestoRef.current.startOffY + dy, zoom);
      setOffsetX(ox); setOffsetY(oy);
    } else if (gestoRef.current.modo === 'pinch' && e.touches.length === 2) {
      const nuevaDist = distanciaEntreToques(e.touches[0], e.touches[1]);
      const nuevoZoom = Math.max(1, Math.min(3, gestoRef.current.startZoom * (nuevaDist / gestoRef.current.startDist)));
      const { ox, oy } = limitarOffset(offsetX, offsetY, nuevoZoom);
      setZoom(nuevoZoom); setOffsetX(ox); setOffsetY(oy);
    }
  };
  const onTouchEnd = () => { gestoRef.current.modo = 'ninguno'; };

  const arrastreMouseRef = useRef({ activo: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0 });
  const onMouseDown = (e: React.MouseEvent) => {
    if (!imagenObj) return;
    arrastreMouseRef.current = { activo: true, startX: e.clientX, startY: e.clientY, startOffX: offsetX, startOffY: offsetY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!arrastreMouseRef.current.activo) return;
    const dx = (e.clientX - arrastreMouseRef.current.startX) / escalaViewport;
    const dy = (e.clientY - arrastreMouseRef.current.startY) / escalaViewport;
    const { ox, oy } = limitarOffset(arrastreMouseRef.current.startOffX + dx, arrastreMouseRef.current.startOffY + dy, zoom);
    setOffsetX(ox); setOffsetY(oy);
  };
  const onMouseUpOrLeave = () => { arrastreMouseRef.current.activo = false; };

  const onZoomSlider = (nuevoZoom: number) => {
    const { ox, oy } = limitarOffset(offsetX, offsetY, nuevoZoom);
    setZoom(nuevoZoom); setOffsetX(ox); setOffsetY(oy);
  };

  // Exporta el canvas final llamando a la MISMA funcion de dibujo que la vista previa.
  const generarCanvasFinal = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext('2d')!;
    dibujarCardCompleta(ctx);
    return canvas;
  };

  const compartirCard = async () => {
    setProcesando(true);
    try {
      const canvas = generarCanvasFinal();
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

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, flexDirection: 'column', gap: 12, padding: 16, fontFamily: "'DM Sans', sans-serif" }}>
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

      <div style={{ width: dims.w * escalaViewport, height: dims.h * escalaViewport, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px -30px rgba(0,0,0,0.7)', position: 'relative' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUpOrLeave} onMouseLeave={onMouseUpOrLeave}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ width: '100%', height: '100%', display: 'block', cursor: imagenObj ? 'grab' : 'default', touchAction: imagenObj ? 'none' : 'auto' }}
        />
        {!imagenObj && (
          <button onClick={() => fileInputRef.current?.click()} style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            background: 'none', border: `1.5px dashed ${C.muted}`, borderRadius: 16, padding: '24px 32px', cursor: 'pointer',
          }}>
            <ImageIcon size={26} color={C.muted} />
            <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 600 }}>Añadir foto</span>
          </button>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFotoSeleccionada} style={{ display: 'none' }} />

      {fotoBajaResolucion && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2A1F0D', border: '1px solid #FF6B0050', borderRadius: 10, padding: '8px 14px', maxWidth: dims.w * escalaViewport }}>
          <AlertTriangle size={14} color={C.accent} />
          <span style={{ color: C.ink, fontSize: 12 }}>Foto de baja resolución.</span>
        </div>
      )}

      {imagenObj && (
        <>
          <p style={{ color: C.muted, fontSize: 11.5, textAlign: 'center' }}>Arrastra para mover · pellizca para zoom</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: dims.w * escalaViewport }}>
            <span style={{ color: C.muted, fontSize: 11, fontWeight: 600 }}>1x</span>
            <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => onZoomSlider(Number(e.target.value))} style={{ flex: 1, accentColor: C.accent }} />
            <span style={{ color: C.muted, fontSize: 11, fontWeight: 600 }}>3x</span>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {imagenObj && (
          <button onClick={() => fileInputRef.current?.click()} style={{
            display: 'flex', alignItems: 'center', gap: 8, background: '#141414', color: C.ink, border: `1px solid #232323`,
            borderRadius: 100, padding: '13px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            <Upload size={16} />
            Cambiar
          </button>
        )}
        <button onClick={compartirCard} disabled={procesando || !imagenObj} style={{
          display: 'flex', alignItems: 'center', gap: 8, background: imagenObj ? C.accent : '#333', color: '#fff', border: 'none',
          borderRadius: 100, padding: '13px 30px', fontSize: 14, fontWeight: 700, cursor: imagenObj ? 'pointer' : 'not-allowed',
          boxShadow: imagenObj ? `0 10px 30px -8px ${C.accent}70` : 'none', opacity: imagenObj ? 1 : 0.5,
        }}>
          <Share2 size={16} />
          {procesando ? 'Preparando...' : 'Compartir'}
        </button>
      </div>
    </div>
  );
}