import { useState, useRef, useEffect, useId } from 'react';
import { X, Upload, Image as ImageIcon, AlertTriangle, Share2, ZoomIn, ZoomOut } from 'lucide-react';

const C = { bg: '#050505', ink: '#F5F2EC', muted: '#7A756E', accent: '#FF6B00' };

type Disciplina = 'carrera' | 'crossfit';
type Formato = '9:16' | '4:5' | '1:1';

const FORMATOS: Record<Formato, { w: number; h: number; label: string; contentBottom: number }> = {
  '9:16': { w: 1080, h: 1920, label: 'Story', contentBottom: 340 },
  '4:5': { w: 1080, h: 1350, label: 'Feed', contentBottom: 280 },
  '1:1': { w: 1080, h: 1080, label: 'Cuadrado', contentBottom: 230 },
};

const FILTROS: { id: string; label: string }[] = [
  { id: 'original', label: 'Original' }, { id: 'mono', label: 'Mono' }, { id: 'contraste', label: 'Contraste' },
  { id: 'calido', label: 'Cálido' }, { id: 'frio', label: 'Frío' }, { id: 'noche', label: 'Noche' },
];

interface RunningData { distancia?: string; tiempo?: string; ritmo?: string; fcMedia?: string; fcMax?: string; desnivel?: string; intervalos?: string; etiquetaTipo?: string; }
interface CrossfitData { nombreWod?: string; resultado?: string; tipo?: string; movimientos?: string; }
interface WorkoutShareCardProps { disciplina: Disciplina; fecha: string; running?: RunningData; crossfit?: CrossfitData; onClose?: () => void; }

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
function distanciaEntreToques(t0: React.Touch, t1: React.Touch) { return Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY); }

function fileToDataUrl(file: string): Promise<string> {
  // Si ya es data: URL, devolver tal cual. Si es ruta relativa (logo), fetch + convertir.
  if (file.startsWith('data:')) return Promise.resolve(file);
  return fetch(file).then(r => r.blob()).then(blob => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  }));
}

interface LineaTexto { texto: string; tamano: number; color: string; peso: number; familia: string; alpha?: number; alturaLinea: number; }

function construirBloqueTexto(disciplina: Disciplina, running: RunningData | undefined, crossfit: CrossfitData | undefined, alturaDisponible: number): LineaTexto[] {
  const GAP = 22;
  const candidatas: LineaTexto[] = [];
  if (disciplina === 'carrera') {
    const { principal, secundario } = calcularResultadoPrincipalRunning(running || {});
    const etiqueta = calcularEtiquetaRunning(running || {});
    const metricas = [
      running?.intervalos && running?.distancia && `${running.distancia} KM`,
      running?.fcMedia && `${running.fcMedia} FC`,
      running?.fcMax && `${running.fcMax} MAX`,
      running?.desnivel && `${running.desnivel} D+`,
    ].filter(Boolean).join(' · ');
    candidatas.push({ texto: etiqueta, tamano: 26, color: C.accent, peso: 800, familia: 'DM Sans, sans-serif', alturaLinea: 26 });
    candidatas.push({ texto: principal || '—', tamano: 88, color: C.ink, peso: 800, familia: 'Georgia, serif', alturaLinea: 88 });
    if (secundario) candidatas.push({ texto: secundario, tamano: 38, color: C.ink, peso: 700, familia: 'Georgia, serif', alpha: 0.9, alturaLinea: 38 });
    if (metricas) candidatas.push({ texto: metricas, tamano: 24, color: C.muted, peso: 600, familia: 'DM Sans, sans-serif', alturaLinea: 24 });
  } else {
    const movimientos = crossfit?.movimientos && crossfit.movimientos.length > 70 ? crossfit.movimientos.slice(0, 67).trim() + '...' : crossfit?.movimientos;
    candidatas.push({ texto: `WOD${crossfit?.tipo ? ` · ${crossfit.tipo.toUpperCase()}` : ''}`, tamano: 25, color: C.accent, peso: 800, familia: 'DM Sans, sans-serif', alturaLinea: 25 });
    candidatas.push({ texto: crossfit?.nombreWod || 'Entreno de hoy', tamano: 44, color: C.ink, peso: 800, familia: 'DM Sans, sans-serif', alturaLinea: 48 });
    candidatas.push({ texto: crossfit?.resultado || '—', tamano: 88, color: C.ink, peso: 800, familia: 'Georgia, serif', alturaLinea: 88 });
    if (movimientos) candidatas.push({ texto: movimientos, tamano: 22, color: C.muted, peso: 500, familia: 'DM Sans, sans-serif', alturaLinea: 22 });
  }
  let lineas = [...candidatas];
  const alturaTotal = () => lineas.reduce((sum, l) => sum + l.alturaLinea, 0) + GAP * (lineas.length - 1);
  while (lineas.length > 2 && alturaTotal() > alturaDisponible) lineas.pop();
  return lineas;
}

// FORGE calculateImageRect — funcion CENTRAL unica, usada por preview Y export. offsetX/offsetY
// son desplazamientos en COORDENADAS REALES DE LA CARD (px de 1080 base), no focal 0-1 — elimina
// la escala variable que causaba el arrastre brusco/imperceptible. zoom=1 es el minimo COVER real
// (sin huecos); zoom>1 amplia. El clamp de offset se calcula sobre el rect real, no aproximado.
function calculateImageRect(imgW: number, imgH: number, cardW: number, cardH: number, zoom: number, offsetX: number, offsetY: number) {
  if (!imgW || !imgH) return { x: 0, y: 0, w: cardW, h: cardH, offsetXClamped: 0, offsetYClamped: 0 };
  const coverBase = Math.max(cardW / imgW, cardH / imgH) * zoom;
  const w = imgW * coverBase, h = imgH * coverBase;
  const maxOffsetX = Math.max(0, (w - cardW) / 2);
  const maxOffsetY = Math.max(0, (h - cardH) / 2);
  const offsetXClamped = Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX));
  const offsetYClamped = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));
  const x = (cardW - w) / 2 + offsetXClamped;
  const y = (cardH - h) / 2 + offsetYClamped;
  return { x, y, w, h, offsetXClamped, offsetYClamped };
}

export default function WorkoutShareCard({ disciplina, fecha, running, crossfit, onClose }: WorkoutShareCardProps) {
  const instanceId = useId().replace(/:/g, '');
  const [foto, setFoto] = useState<string | null>(null);
  const [fotoBajaResolucion, setFotoBajaResolucion] = useState(false);
  const [formato, setFormato] = useState<Formato>('9:16');
  const [filtroCss, setFiltroCss] = useState('original');
  const [zoom, setZoom] = useState(1);
  // FIX FASE 2: offsetX/offsetY en px reales de la card (1080 base), no focal 0-1 — movimiento 1:1 real.
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  const [procesando, setProcesando] = useState(false);
  const [escalaViewport, setEscalaViewport] = useState(0.3);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dims = FORMATOS[formato];

  useEffect(() => {
    const calcular = () => {
      const maxAlto = window.innerHeight - 320;
      const maxAncho = Math.min(window.innerWidth - 48, 460);
      setEscalaViewport(Math.min(maxAncho / dims.w, maxAlto / dims.h));
    };
    calcular();
    window.addEventListener('resize', calcular);
    return () => window.removeEventListener('resize', calcular);
  }, [dims.w, dims.h]);

  // FIX FASE 2: al cambiar de formato, recalcular offset para mantener el CENTRO relativo del
  // encuadre en vez de reutilizar px absolutos de un formato distinto (que producia resultados
  // visuales incoherentes entre Story/Feed/Cuadrado).
  const dimsAnteriorRef = useRef(dims);
  useEffect(() => {
    if (dimsAnteriorRef.current !== dims && imgDims.w) {
      const factorX = offsetX / (dimsAnteriorRef.current.w || 1);
      const factorY = offsetY / (dimsAnteriorRef.current.h || 1);
      setOffsetX(factorX * dims.w);
      setOffsetY(factorY * dims.h);
    }
    dimsAnteriorRef.current = dims;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formato]);

  const handleFotoSeleccionada = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new window.Image();
    img.onload = () => { setFotoBajaResolucion(img.width < 1080 || img.height < 1080); setImgDims({ w: img.width, h: img.height }); };
    const reader = new FileReader();
    reader.onload = (ev) => { const r = ev.target?.result as string; img.src = r; setFoto(r); setZoom(1); setOffsetX(0); setOffsetY(0); };
    reader.readAsDataURL(file);
  };

  const rectFoto = calculateImageRect(imgDims.w, imgDims.h, dims.w, dims.h, zoom, offsetX, offsetY);

  // FIX FASE 2: arrastre 1:1 real — delta de pantalla / escalaViewport = delta en coordenadas
  // reales de la card, directamente sobre offsetX/offsetY (sin pasar por focal 0-1 intermedio).
  // FIX: sistema UNICO de gestos con Pointer Events reales — Map de punteros activos para pinch
// multi-touch genuino (Pointer Events no expone e.touches, hay que rastrear punteros manualmente).
// Un solo camino de codigo para dedo y raton, sin duplicacion Touch/Mouse.
const gestoRef = useRef({ modo: 'ninguno' as 'ninguno' | 'pan' | 'pinch', startX: 0, startY: 0, startOffX: 0, startOffY: 0, startDist: 0, startZoom: 1, pointerId: null as number | null });
  const punterosActivosRef = useRef(new Map<number, { x: number; y: number }>());

  const onPointerDown = (e: React.PointerEvent) => {
    if (!foto) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    punterosActivosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (punterosActivosRef.current.size === 1) {
      gestoRef.current = { ...gestoRef.current, modo: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startOffX: offsetX, startOffY: offsetY };
    } else if (punterosActivosRef.current.size === 2) {
      const puntos = Array.from(punterosActivosRef.current.values());
      const dist = Math.hypot(puntos[0].x - puntos[1].x, puntos[0].y - puntos[1].y);
      gestoRef.current = { ...gestoRef.current, modo: 'pinch', startDist: dist, startZoom: zoom };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!foto || !punterosActivosRef.current.has(e.pointerId)) return;
    punterosActivosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.preventDefault();

    if (gestoRef.current.modo === 'pan' && gestoRef.current.pointerId === e.pointerId && punterosActivosRef.current.size === 1) {
      const dxReal = (e.clientX - gestoRef.current.startX) / escalaViewport;
      const dyReal = (e.clientY - gestoRef.current.startY) / escalaViewport;
      const rect = calculateImageRect(imgDims.w, imgDims.h, dims.w, dims.h, zoom, gestoRef.current.startOffX + dxReal, gestoRef.current.startOffY + dyReal);
      setOffsetX(rect.offsetXClamped);
      setOffsetY(rect.offsetYClamped);
    } else if (gestoRef.current.modo === 'pinch' && punterosActivosRef.current.size === 2) {
      const puntos = Array.from(punterosActivosRef.current.values());
      const distActual = Math.hypot(puntos[0].x - puntos[1].x, puntos[0].y - puntos[1].y);
      setZoom(Math.max(1, Math.min(3, gestoRef.current.startZoom * (distActual / gestoRef.current.startDist))));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    punterosActivosRef.current.delete(e.pointerId);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (punterosActivosRef.current.size === 0) {
      gestoRef.current.modo = 'ninguno';
      gestoRef.current.pointerId = null;
    } else if (punterosActivosRef.current.size === 1) {
      // Quedo 1 dedo tras soltar el segundo — retomar modo pan desde la posicion actual
      const [restante] = Array.from(punterosActivosRef.current.values());
      gestoRef.current = { ...gestoRef.current, modo: 'pan', startX: restante.x, startY: restante.y, startOffX: offsetX, startOffY: offsetY };
    }
  };

  const escala = dims.w / 1080;
  const px = 66 * escala;
  const alturaDisponible = dims.contentBottom - 70;
  const lineasBloque = construirBloqueTexto(disciplina, running, crossfit, alturaDisponible);

  const gapEscalado = 22 * escala;
  const gapEtiquetaEscalado = 38 * escala;
  let yAcumulado = dims.h - 90 * escala;
  const totalLineas = lineasBloque.length;
  const lineasPosicionadas = [...lineasBloque].reverse().map((l, idxReverso) => {
    yAcumulado -= l.alturaLinea * escala;
    const y = yAcumulado;
    const esUltimaDelReverso = idxReverso === totalLineas - 1;
    yAcumulado -= esUltimaDelReverso ? 0 : gapEscalado;
    if (idxReverso === totalLineas - 2) yAcumulado -= (gapEtiquetaEscalado - gapEscalado);
    return { ...l, y, tamano: l.tamano * escala };
  }).reverse();

  const footerY = dims.h - 55 * escala;
  const svgId = `forge-share-card-svg-${instanceId}`;
  const filterId = `fotoFiltro-${instanceId}`;
  const clipId = `cardClip-${instanceId}`;
  const gradientId = `cardGrad-${instanceId}`;

  // FIX FASE 1: filter SIEMPRE presente en el DOM con id unico por instancia. "original" usa
  // matriz identidad matematica en vez de ausencia — el <image> SIEMPRE referencia el mismo id,
  // nunca transiciona entre "con filtro" y "sin filtro".
  const SvgContent = ({ width, height }: { width: number; height: number }) => (
    <svg id={svgId} viewBox={`0 0 ${dims.w} ${dims.h}`} width={width} height={height} xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', background: '#161616' }}>
      <defs>
        <clipPath id={clipId}><rect x="0" y="0" width={dims.w} height={dims.h} /></clipPath>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#050505" stopOpacity="0" /><stop offset="30%" stopColor="#050505" stopOpacity="0" />
          <stop offset="62%" stopColor="#050505" stopOpacity="0.55" /><stop offset="100%" stopColor="#050505" stopOpacity="0.94" />
        </linearGradient>
        <filter id={filterId}>
          {filtroCss === 'original' && <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />}
          {filtroCss === 'mono' && <feColorMatrix type="saturate" values="0.05" />}
          {filtroCss === 'contraste' && <feComponentTransfer><feFuncR type="linear" slope="1.3" intercept="-0.12" /><feFuncG type="linear" slope="1.3" intercept="-0.12" /><feFuncB type="linear" slope="1.3" intercept="-0.12" /></feComponentTransfer>}
          {filtroCss === 'calido' && <feColorMatrix type="matrix" values="1.1 0 0 0 0.04  0 1.02 0 0 0.01  0 0 0.82 0 0  0 0 0 1 0" />}
          {filtroCss === 'frio' && <feColorMatrix type="matrix" values="0.92 0 0 0 0  0 1 0 0 0  0 0 1.12 0 0.02  0 0 0 1 0" />}
          {filtroCss === 'noche' && <feComponentTransfer><feFuncR type="linear" slope="0.82" /><feFuncG type="linear" slope="0.82" /><feFuncB type="linear" slope="0.82" /></feComponentTransfer>}
        </filter>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width={dims.w} height={dims.h} fill="#161616" />
        {foto && <image href={foto} x={rectFoto.x} y={rectFoto.y} width={rectFoto.w} height={rectFoto.h} preserveAspectRatio="none" filter={`url(#${filterId})`} />}
        <rect x="0" y="0" width={dims.w} height={dims.h} fill={`url(#${gradientId})`} />
        {lineasPosicionadas.map((l, i) => (
          <text key={i} x={px} y={l.y} fontSize={l.tamano} fontWeight={l.peso} fontFamily={l.familia} fill={l.color} opacity={l.alpha ?? 1}>{l.texto}</text>
        ))}
        <image href="/logo-forge.png" x={px} y={footerY - 22 * escala} width={26 * escala} height={26 * escala} />
        <text x={px + 34 * escala} y={footerY} fontSize={26 * escala} fontWeight={800} fill={C.accent} letterSpacing="3" fontFamily="DM Sans, sans-serif">FORGE</text>
        <text x={dims.w - px} y={footerY} fontSize={20 * escala} fontWeight={500} fill={C.muted} textAnchor="end" fontFamily="DM Sans, sans-serif">{fecha}</text>
      </g>
    </svg>
  );

  // FIX FASE 4: SVG autocontenido — logo convertido a data URL antes de exportar, elimina la
  // dependencia de resolver una ruta relativa dentro del Blob serializado.
  const compartirCard = async () => {
    setProcesando(true);
    try {
      const svgEl = document.getElementById(svgId);
      if (!svgEl) return;
      const logoDataUrl = await fileToDataUrl('/logo-forge.png').catch(() => null);

      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('width', String(dims.w));
      clone.setAttribute('height', String(dims.h));
      if (logoDataUrl) {
        const logoImg = clone.querySelector('image[href="/logo-forge.png"]');
        if (logoImg) logoImg.setAttribute('href', logoDataUrl);
      }
      const svgMarkup = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const img = new window.Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = svgUrl; });
      const canvas = document.createElement('canvas');
      canvas.width = dims.w * 2; canvas.height = dims.h * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, dims.w, dims.h);
      URL.revokeObjectURL(svgUrl);
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const file = new File([blob], `forge-${disciplina}-${Date.now()}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Mi entreno con Forge' });
      else { const url = URL.createObjectURL(blob); window.open(url, '_blank'); }
    } catch (err) { console.error('Error compartiendo Card:', err); }
    finally { setProcesando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, flexDirection: 'column', gap: 12, padding: 16, fontFamily: "'DM Sans', sans-serif", overflowY: 'auto' }}>
      {onClose && <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: '#141414', border: '1px solid #232323', borderRadius: 100, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}><X size={17} color={C.ink} /></button>}

      <div style={{ display: 'flex', gap: 8 }}>
        {(Object.keys(FORMATOS) as Formato[]).map(f => (
          <button key={f} onClick={() => setFormato(f)} style={{ background: formato === f ? C.accent : '#141414', color: formato === f ? '#fff' : C.muted, border: `1px solid ${formato === f ? C.accent : '#232323'}`, borderRadius: 100, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{FORMATOS[f].label}</button>
        ))}
      </div>

      <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        style={{ position: 'relative', cursor: foto ? 'grab' : 'default', touchAction: 'none', userSelect: 'none', boxShadow: '0 40px 100px -30px rgba(0,0,0,0.7)', borderRadius: 20 * escalaViewport, overflow: 'hidden' }}>
        <SvgContent width={dims.w * escalaViewport} height={dims.h * escalaViewport} />
        {!foto && (
          <button onClick={() => fileInputRef.current?.click()} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'none', border: `1.5px dashed ${C.muted}`, borderRadius: 16, padding: '24px 32px', cursor: 'pointer' }}>
            <ImageIcon size={26} color={C.muted} /><span style={{ color: C.muted, fontSize: 12.5, fontWeight: 600 }}>Añadir foto</span>
          </button>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFotoSeleccionada} style={{ display: 'none' }} />

      {fotoBajaResolucion && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2A1F0D', border: '1px solid #FF6B0050', borderRadius: 10, padding: '8px 14px', maxWidth: dims.w * escalaViewport }}>
          <AlertTriangle size={14} color={C.accent} /><span style={{ color: C.ink, fontSize: 12 }}>Foto de baja resolución.</span>
        </div>
      )}

      {foto && (
        <>
          <p style={{ color: C.muted, fontSize: 11.5, textAlign: 'center' }}>Arrastra para mover</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setZoom(z => Math.max(1, z - 0.1))} style={{ background: '#141414', border: '1px solid #232323', borderRadius: 100, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ZoomOut size={15} color={C.ink} /></button>
            <input type="range" min={1} max={3} step={0.02} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: 140, accentColor: C.accent }} />
            <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} style={{ background: '#141414', border: '1px solid #232323', borderRadius: 100, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ZoomIn size={15} color={C.ink} /></button>
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', maxWidth: dims.w * escalaViewport, paddingBottom: 2 }}>
            {FILTROS.map(f => (
              <button key={f.id} onClick={() => setFiltroCss(f.id)} style={{ flexShrink: 0, background: filtroCss === f.id ? C.accent : '#141414', color: filtroCss === f.id ? '#fff' : C.muted, border: `1px solid ${filtroCss === f.id ? C.accent : '#232323'}`, borderRadius: 100, padding: '6px 14px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{f.label}</button>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {foto && <button onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#141414', color: C.ink, border: `1px solid #232323`, borderRadius: 100, padding: '13px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}><Upload size={16} />Cambiar</button>}
        <button onClick={compartirCard} disabled={procesando || !foto} style={{ display: 'flex', alignItems: 'center', gap: 8, background: foto ? C.accent : '#333', color: '#fff', border: 'none', borderRadius: 100, padding: '13px 30px', fontSize: 14, fontWeight: 700, cursor: foto ? 'pointer' : 'not-allowed', boxShadow: foto ? `0 10px 30px -8px ${C.accent}70` : 'none', opacity: foto ? 1 : 0.5 }}>
          <Share2 size={16} />{procesando ? 'Preparando...' : 'Compartir'}
        </button>
      </div>
    </div>
  );
}