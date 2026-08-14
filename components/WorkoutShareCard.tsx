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

// Dimensiones matematicas fijas, base 1080 de ancho para todos los formatos
const FORMATOS: Record<Formato, { w: number; h: number; label: string }> = {
  '9:16': { w: 1080, h: 1920, label: 'Story' },
  '4:5': { w: 1080, h: 1350, label: 'Feed' },
  '1:1': { w: 1080, h: 1080, label: 'Cuadrado' },
};

const FILTROS: { id: string; label: string; svgFilter: string }[] = [
  { id: 'original', label: 'Original', svgFilter: '' },
  { id: 'mono', label: 'Mono', svgFilter: 'grayscale(1) contrast(1.1)' },
  { id: 'contraste', label: 'Contraste', svgFilter: 'contrast(1.35) saturate(1.15)' },
  { id: 'calido', label: 'Cálido', svgFilter: 'sepia(0.25) saturate(1.3) contrast(1.05)' },
  { id: 'frio', label: 'Frío', svgFilter: 'hue-rotate(-8deg) saturate(1.1) brightness(0.97)' },
  { id: 'noche', label: 'Noche', svgFilter: 'brightness(0.85) contrast(1.2) saturate(0.9)' },
];

interface RunningData {
  distancia?: string; tiempo?: string; ritmo?: string; fcMedia?: string; fcMax?: string; desnivel?: string; intervalos?: string; etiquetaTipo?: string;
}
interface CrossfitData {
  nombreWod?: string; resultado?: string; tipo?: string; movimientos?: string;
}
interface WorkoutShareCardProps {
  disciplina: Disciplina; fecha: string; running?: RunningData; crossfit?: CrossfitData; onClose?: () => void;
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

// ============================================================
// FORGE SHARE CARD — renderer SVG puro. Coordenadas matematicas fijas,
// sin DOM que medir, sin zoom/transform que interpretar de forma distinta
// entre navegador y herramienta de exportacion. El MISMO SVG se usa para
// preview (embebido en pantalla) y para exportacion (serializado -> canvas -> PNG).
// ============================================================
export default function WorkoutShareCard({ disciplina, fecha, running, crossfit, onClose }: WorkoutShareCardProps) {
  const [foto, setFoto] = useState<string | null>(null);
  const [fotoBajaResolucion, setFotoBajaResolucion] = useState(false);
  const [formato, setFormato] = useState<Formato>('9:16');
  const [filtro, setFiltro] = useState('original');
  const [zoom, setZoom] = useState(1);
  const [posX, setPosX] = useState(50); // 0-100 %
  const [posY, setPosY] = useState(50);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  const [procesando, setProcesando] = useState(false);
  const [escalaViewport, setEscalaViewport] = useState(0.3);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
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
    img.onload = () => {
      setFotoBajaResolucion(img.width < 1080 || img.height < 1080);
      setImgDims({ w: img.width, h: img.height });
    };
    const reader = new FileReader();
    reader.onload = (ev) => {
      const resultado = ev.target?.result as string;
      img.src = resultado;
      setFoto(resultado);
      setZoom(1); setPosX(50); setPosY(50);
    };
    reader.readAsDataURL(file);
  };

  // Calcula el rectangulo de "cover" real (matematico) de la foto dentro del marco dims.w x dims.h
  const calcularRectFoto = () => {
    if (!imgDims.w || !imgDims.h) return { x: 0, y: 0, w: dims.w, h: dims.h };
    const coverBase = Math.max(dims.w / imgDims.w, dims.h / imgDims.h);
    const escalaFinal = coverBase * zoom;
    const anchoDibujo = imgDims.w * escalaFinal;
    const altoDibujo = imgDims.h * escalaFinal;
    const x = (dims.w - anchoDibujo) / 2 - (posX - 50) / 100 * (anchoDibujo - dims.w);
    const y = (dims.h - altoDibujo) / 2 - (posY - 50) / 100 * (altoDibujo - dims.h);
    return { x, y, w: anchoDibujo, h: altoDibujo };
  };
  const rectFoto = calcularRectFoto();

  const limitarPos = (px: number, py: number, z: number) => {
    if (!imgDims.w) return { px, py };
    const coverBase = Math.max(dims.w / imgDims.w, dims.h / imgDims.h);
    const anchoDibujo = imgDims.w * coverBase * z;
    const altoDibujo = imgDims.h * coverBase * z;
    const margenX = anchoDibujo > dims.w ? 50 : 50;
    const margenY = altoDibujo > dims.h ? 50 : 50;
    return { px: Math.max(0, Math.min(100, px)), py: Math.max(0, Math.min(100, py)) };
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
      // FIX: multiplicador de sensibilidad — el rango real de movimiento util de la foto es mucho
      // mas amplio que 100 unidades cuando hay zoom aplicado, por eso el arrastre se sentia casi
      // imperceptible. Se amplifica la conversion de pixeles de pantalla a unidades de posicion.
      const dx = (e.touches[0].clientX - gestoRef.current.startX) / (dims.w * escalaViewport) * 100 * 2.5;
      const dy = (e.touches[0].clientY - gestoRef.current.startY) / (dims.h * escalaViewport) * 100 * 2.5;
      const { px, py } = limitarPos(gestoRef.current.startPosX - dx, gestoRef.current.startPosY - dy, zoom);
      setPosX(px); setPosY(py);
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
    const dx = (e.clientX - arrastreMouseRef.current.startX) / (dims.w * escalaViewport) * 100 * 2.5;
    const dy = (e.clientY - arrastreMouseRef.current.startY) / (dims.h * escalaViewport) * 100 * 2.5;
    const { px, py } = limitarPos(arrastreMouseRef.current.startPosX - dx, arrastreMouseRef.current.startPosY - dy, zoom);
    setPosX(px); setPosY(py);
  };
  const onMouseUpOrLeave = () => { arrastreMouseRef.current.activo = false; };

  const filtroActivo = FILTROS.find(f => f.id === filtro) || FILTROS[0];

  // Datos textuales precalculados (mismos para preview y export)
  const escala = dims.w / 1080;
  const px = 66 * escala;
  const anclaInferior = dims.h * 0.14;

  let lineasTexto: { texto: string; y: number; tamano: number; color: string; peso: number; familia: string; alpha?: number }[] = [];
  let footerY = dims.h - dims.h * 0.035;

  if (disciplina === 'carrera') {
    const { principal, secundario } = calcularResultadoPrincipalRunning(running || {});
    const etiqueta = calcularEtiquetaRunning(running || {});
    const metricas = [
      running?.intervalos && running?.distancia && `${running.distancia} KM`,
      running?.fcMedia && `${running.fcMedia} FC`,
      running?.fcMax && `${running.fcMax} MAX`,
      running?.desnivel && `${running.desnivel} D+`,
    ].filter(Boolean).join(' · ');
    let y = dims.h - anclaInferior - (metricas ? 45 * escala : 0);
    lineasTexto.push({ texto: etiqueta, y, tamano: 27 * escala, color: C.accent, peso: 800, familia: 'DM Sans, sans-serif' });
    y += 100 * escala;
    lineasTexto.push({ texto: principal || '—', y, tamano: 100 * escala, color: C.ink, peso: 800, familia: 'Georgia, serif' });
    if (secundario) { y += 60 * escala; lineasTexto.push({ texto: secundario, y, tamano: 42 * escala, color: C.ink, peso: 700, familia: 'Georgia, serif', alpha: 0.9 }); }
    if (metricas) { y += 48 * escala; lineasTexto.push({ texto: metricas, y, tamano: 26 * escala, color: C.muted, peso: 600, familia: 'DM Sans, sans-serif' }); }
  } else {
    const movimientos = crossfit?.movimientos && crossfit.movimientos.length > 70 ? crossfit.movimientos.slice(0, 67).trim() + '...' : crossfit?.movimientos;
    let y = dims.h - anclaInferior - 65 * escala;
    lineasTexto.push({ texto: `WOD${crossfit?.tipo ? ` · ${crossfit.tipo.toUpperCase()}` : ''}`, y, tamano: 27 * escala, color: C.accent, peso: 800, familia: 'DM Sans, sans-serif' });
    y += 70 * escala;
    lineasTexto.push({ texto: crossfit?.nombreWod || 'Entreno de hoy', y, tamano: 50 * escala, color: C.ink, peso: 800, familia: 'DM Sans, sans-serif' });
    y += 110 * escala;
    lineasTexto.push({ texto: crossfit?.resultado || '—', y, tamano: 100 * escala, color: C.ink, peso: 800, familia: 'Georgia, serif' });
    if (movimientos) { y += 56 * escala; lineasTexto.push({ texto: movimientos, y, tamano: 26 * escala, color: C.muted, peso: 500, familia: 'DM Sans, sans-serif' }); }
  }

  const svgId = 'forge-share-card-svg';

  const SvgContent = ({ width, height }: { width: number; height: number }) => (
    <svg id={svgId} ref={svgRef} viewBox={`0 0 ${dims.w} ${dims.h}`} width={width} height={height} xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', borderRadius: 20 * escalaViewport, background: '#161616' }}>
      <defs>
        <clipPath id="cardClip"><rect x="0" y="0" width={dims.w} height={dims.h} rx="0" /></clipPath>
        <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#050505" stopOpacity="0" />
          <stop offset="30%" stopColor="#050505" stopOpacity="0" />
          <stop offset="62%" stopColor="#050505" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#050505" stopOpacity="0.94" />
        </linearGradient>
        {filtroActivo.svgFilter && (
          <filter id="fotoFiltro">
            {filtro === 'mono' && <><feColorMatrix type="saturate" values="0" /><feComponentTransfer><feFuncR type="linear" slope="1.1" intercept="-0.05" /><feFuncG type="linear" slope="1.1" intercept="-0.05" /><feFuncB type="linear" slope="1.1" intercept="-0.05" /></feComponentTransfer></>}
            {filtro === 'contraste' && <feComponentTransfer><feFuncR type="linear" slope="1.35" intercept="-0.15" /><feFuncG type="linear" slope="1.35" intercept="-0.15" /><feFuncB type="linear" slope="1.35" intercept="-0.15" /></feComponentTransfer>}
            {filtro === 'calido' && <feColorMatrix type="matrix" values="1.1 0 0 0 0.03  0 1.02 0 0 0.01  0 0 0.85 0 0  0 0 0 1 0" />}
            {filtro === 'frio' && <feColorMatrix type="matrix" values="0.95 0 0 0 0  0 1 0 0 0  0 0 1.1 0 0.02  0 0 0 1 0" />}
            {filtro === 'noche' && <feComponentTransfer><feFuncR type="linear" slope="0.85" /><feFuncG type="linear" slope="0.85" /><feFuncB type="linear" slope="0.85" /></feComponentTransfer>}
          </filter>
        )}
      </defs>
      <g clipPath="url(#cardClip)">
        <rect x="0" y="0" width={dims.w} height={dims.h} fill="#161616" />
        {foto && (
          <image href={foto} x={rectFoto.x} y={rectFoto.y} width={rectFoto.w} height={rectFoto.h} preserveAspectRatio="none" filter={filtroActivo.svgFilter ? 'url(#fotoFiltro)' : undefined} />
        )}
        <rect x="0" y="0" width={dims.w} height={dims.h} fill="url(#cardGrad)" />
        {lineasTexto.map((l, i) => (
          <text key={i} x={px} y={l.y} fontSize={l.tamano} fontWeight={l.peso} fontFamily={l.familia} fill={l.color} opacity={l.alpha ?? 1} style={{ filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.6))' }}>{l.texto}</text>
        ))}
        <text x={dims.w - px} y={footerY} fontSize={22 * escala} fontWeight={500} fill={C.muted} textAnchor="end" fontFamily="DM Sans, sans-serif">{fecha}</text>
        <image href="/logo-forge.png" x={px} y={footerY - 22 * escala} width={26 * escala} height={26 * escala} />
        <text x={px + 34 * escala} y={footerY} fontSize={28 * escala} fontWeight={800} fill={C.accent} letterSpacing="3" fontFamily="DM Sans, sans-serif">FORGE</text>
      </g>
    </svg>
  );

  // Exportacion: serializa el MISMO svg a tamaño real 1080xN, rasteriza a canvas, exporta PNG
  const compartirCard = async () => {
    setProcesando(true);
    try {
      const svgMarkup = document.getElementById(svgId)?.outerHTML;
      if (!svgMarkup) return;
      // Reconstruir con viewBox y tamaño real de exportacion explicitos (independiente del preview)
      const svgExport = svgMarkup.replace(/width="[^"]*"/, `width="${dims.w}"`).replace(/height="[^"]*"/, `height="${dims.h}"`);
      const svgBlob = new Blob([svgExport], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      const img = new window.Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = svgUrl; });

      const canvas = document.createElement('canvas');
      canvas.width = dims.w * 2;
      canvas.height = dims.h * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, dims.w, dims.h);
      URL.revokeObjectURL(svgUrl);

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
            border: `1px solid ${formato === f ? C.accent : '#232323'}`, borderRadius: 100, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            {FORMATOS[f].label}
          </button>
        ))}
      </div>

      <div
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUpOrLeave} onMouseLeave={onMouseUpOrLeave}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ position: 'relative', cursor: foto ? 'grab' : 'default', touchAction: foto ? 'none' : 'auto', boxShadow: '0 40px 100px -30px rgba(0,0,0,0.7)', borderRadius: 20 * escalaViewport, overflow: 'hidden' }}
      >
        <SvgContent width={dims.w * escalaViewport} height={dims.h * escalaViewport} />
        {!foto && (
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

      {foto && (
        <>
          <p style={{ color: C.muted, fontSize: 11.5, textAlign: 'center' }}>Arrastra para mover · pellizca para zoom</p>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', maxWidth: dims.w * escalaViewport, paddingBottom: 2 }}>
            {FILTROS.map(f => (
              <button key={f.id} onClick={() => setFiltro(f.id)} style={{
                flexShrink: 0, background: filtro === f.id ? C.accent : '#141414', color: filtro === f.id ? '#fff' : C.muted,
                border: `1px solid ${filtro === f.id ? C.accent : '#232323'}`, borderRadius: 100, padding: '6px 14px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
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