import { useState } from 'react';
import { Download, X } from 'lucide-react';

const C = {
  bg: '#080808',
  ink: '#F5F2EC',
  muted: '#726D66',
  accent: '#FF6B00',
  accentDim: '#B34A00',
  gold: '#D4AF37',
  green: '#4ADE80',
  border: '#1E1E1E',
};

type AchievementType = 'pr' | 'pr_absoluto' | 'goal' | 'streak' | 'week' | 'milestone';

interface ForgeCardData {
  achievementType: AchievementType;
  titulo: string;
  valorPrincipal: string;
  subtitulo?: string;
  detalle?: string;
  badge?: string;
  fecha: string;
  contexto?: string;
  disciplina?: string;
}

// ATHLETE BLUEPRINT — planos tecnicos tipo dibujo de ingenieria, un solo trazo, muy grandes,
// pensados para leerse a opacidad casi nula (2-4%) y ocupar la mayor parte de la tarjeta.
const BLUEPRINT: Record<string, string> = {
  // Barra olimpica con discos — front/back squat, bench, deadlift
  fuerza: 'M40 150 L360 150 M40 150 L40 110 L55 110 L55 190 L40 190 Z M60 150 L60 125 L72 125 L72 175 L60 175 Z M360 150 L360 110 L345 110 L345 190 L360 190 Z M340 150 L340 125 L328 125 L328 175 L340 175 Z M200 150 L200 90 M185 105 L215 105 M175 130 L225 130',
  halterofilia: 'M40 150 L360 150 M40 150 L40 110 L55 110 L55 190 L40 190 Z M60 150 L60 125 L72 125 L72 175 L60 175 Z M360 150 L360 110 L345 110 L345 190 L360 190 Z M340 150 L340 125 L328 125 L328 175 L340 175 Z M200 150 L200 90 M185 105 L215 105 M175 130 L225 130',
  // Silueta corredor + trayectoria punteada
  carrera: 'M60 220 Q120 180 160 190 Q190 197 205 165 L245 90 M245 90 L215 60 M245 90 L280 100 M160 190 L135 250 M160 190 L185 245 M205 165 L175 140 L195 75 M100 240 L340 240 M120 240 L140 220 M160 240 L180 215 M200 240 L220 225 M240 240 L260 210 M280 240 L300 220',
  // Rack + pull-up bar
  crossfit: 'M50 90 L50 260 M350 90 L350 260 M50 90 L350 90 M50 260 L350 260 M50 150 L350 150 M100 90 L100 60 M300 90 L300 60 M100 60 L300 60 M150 150 Q160 190 150 220 M250 150 Q240 190 250 220',
  // Bicicleta wireframe
  ciclismo: 'M70 230 A45 45 0 1 1 70 140 A45 45 0 1 1 70 230 M280 230 A45 45 0 1 1 280 140 A45 45 0 1 1 280 230 M70 185 L175 105 L280 185 M175 105 L160 60 L200 60 M175 105 L175 185',
  generico: 'M200 60 L225 145 L315 145 L242 195 L268 280 L200 228 L132 280 L158 195 L85 145 L175 145 Z',
};

const ACHIEVEMENT_CONFIG: Record<AchievementType, { label: string; accentColor: string }> = {
  pr: { label: 'NUEVO PR', accentColor: C.accent },
  pr_absoluto: { label: 'RÉCORD HISTÓRICO', accentColor: C.gold },
  goal: { label: 'OBJETIVO', accentColor: C.green },
  streak: { label: 'RACHA', accentColor: C.accent },
  week: { label: 'SEMANA', accentColor: C.green },
  milestone: { label: 'HITO', accentColor: C.gold },
};

function Blueprint({ disciplina, color }: { disciplina: string; color: string }) {
  const path = BLUEPRINT[disciplina] || BLUEPRINT.generico;
  return (
    <svg viewBox="0 0 400 320" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.05, pointerEvents: 'none' }} preserveAspectRatio="xMidYMid meet">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Grain() {
  // Textura de ruido sutil vía SVG feTurbulence — da profundidad sin banding visible
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.025, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /></filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  );
}

function Particles({ color }: { color: string }) {
  const pts = [[70, 90, 0], [400, 130, 0.4], [420, 340, 0.9], [40, 380, 1.3]];
  return (
    <>
      <style>{`@keyframes fcFloat{0%,100%{opacity:0;transform:translateY(6px) scale(0.8)}50%{opacity:1;transform:translateY(-4px) scale(1)}}`}</style>
      {pts.map(([x, y, d], i) => (
        <div key={i} style={{ position: 'absolute', left: x, top: y, width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 12px 3px ${color}`, animation: `fcFloat 3s ease-in-out ${d}s infinite`, zIndex: 3 }} />
      ))}
    </>
  );
}

function CardShell({ children, glow, disciplina }: { children: React.ReactNode; glow: string; disciplina?: string }) {
  return (
    <div style={{
      width: 480, height: 480, background: `linear-gradient(155deg, #0D0D0D 0%, ${C.bg} 45%, #0A0A0A 100%)`,
      borderRadius: 28, position: 'relative', overflow: 'hidden',
      fontFamily: "'DM Sans', sans-serif",
      boxShadow: `0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px ${C.border}`,
    }}>
      <div style={{ position: 'absolute', top: -140, right: -100, width: 380, height: 380, borderRadius: '50%', background: `radial-gradient(circle, ${glow}30, transparent 65%)`, filter: 'blur(10px)' }} />
      <div style={{ position: 'absolute', bottom: -160, left: -80, width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${glow}12, transparent 70%)`, filter: 'blur(20px)' }} />
      {disciplina !== undefined && <Blueprint disciplina={disciplina} color={glow} />}
      <Grain />
      {children}
    </div>
  );
}

function Footer({ fecha, color }: { fecha: string; color: string }) {
  return (
    <div style={{ position: 'absolute', bottom: 26, left: 34, right: 34, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 18, height: 18, borderRadius: 5, background: `${color}18`, border: `1px solid ${color}45`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/logo-forge.png" alt="" style={{ width: 11, height: 11, objectFit: 'contain' }} />
        </div>
        <span style={{ color: C.ink, fontSize: 10.5, fontWeight: 800, letterSpacing: 1.8, opacity: 0.8 }}>FORGE</span>
      </div>
      <span style={{ color: C.muted, fontSize: 9.5, letterSpacing: 0.4 }}>{fecha}</span>
    </div>
  );
}

function InsightBlock({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ position: 'relative', zIndex: 3, margin: '0 34px 66px', background: `${color}08`, border: `1px solid ${color}22`, borderRadius: 14, padding: '13px 16px' }}>
      <p style={{ color, fontSize: 9.5, fontWeight: 800, letterSpacing: 1, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11 }}>◆</span> FORGE INSIGHT
      </p>
      <p style={{ color: C.ink, fontSize: 12.5, lineHeight: 1.5, opacity: 0.94 }}>{text}</p>
    </div>
  );
}

function LayoutPR({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['pr'] }) {
  return (
    <CardShell glow={config.accentColor} disciplina={data.disciplina || 'generico'}>
      <Particles color={config.accentColor} />
      <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '38px 34px 0' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${config.accentColor}14`, border: `1px solid ${config.accentColor}40`, borderRadius: 100, padding: '5px 13px' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: config.accentColor }} />
            <span style={{ color: config.accentColor, fontSize: 10.5, fontWeight: 800, letterSpacing: 1.8 }}>{config.label}</span>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 34px' }}>
          <p style={{ color: C.muted, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>{data.titulo}</p>
          <p style={{
            color: C.ink, fontSize: 92, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, margin: 0,
            textShadow: `0 0 60px ${config.accentColor}50, 0 0 20px ${config.accentColor}30`,
          }}>{data.valorPrincipal}</p>
          {data.detalle && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
              <span style={{ color: config.accentColor, fontSize: 15 }}>↗</span>
              <span style={{ color: config.accentColor, fontSize: 17, fontWeight: 800 }}>{data.detalle}</span>
            </div>
          )}
        </div>
      </div>
      {data.contexto && <div style={{ position: 'relative', zIndex: 3 }}><InsightBlock text={data.contexto} color={config.accentColor} /></div>}
      <Footer fecha={data.fecha} color={config.accentColor} />
    </CardShell>
  );
}

function LayoutGoal({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['goal'] }) {
  return (
    <CardShell glow={config.accentColor} disciplina={data.disciplina || 'generico'}>
      <Particles color={config.accentColor} />
      <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 44px' }}>
        <div style={{ width: 58, height: 58, borderRadius: '50%', border: `2px solid ${config.accentColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22, boxShadow: `0 0 30px ${config.accentColor}40` }}>
          <span style={{ color: config.accentColor, fontSize: 28, fontWeight: 900 }}>✓</span>
        </div>
        <span style={{ color: config.accentColor, fontSize: 11, fontWeight: 800, letterSpacing: 2.5, marginBottom: 14 }}>OBJETIVO CONSEGUIDO</span>
        <p style={{ color: C.muted, fontSize: 16, fontWeight: 600, marginBottom: 8, maxWidth: 330, lineHeight: 1.4 }}>{data.subtitulo}</p>
        <p style={{ color: C.ink, fontSize: 68, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, margin: '4px 0 0', textShadow: `0 0 50px ${config.accentColor}45` }}>{data.valorPrincipal}</p>
      </div>
      {data.contexto && <InsightBlock text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} color={config.accentColor} />
    </CardShell>
  );
}

function LayoutStreak({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['streak'] }) {
  return (
    <CardShell glow={config.accentColor} disciplina="generico">
      <Particles color={config.accentColor} />
      <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 38, marginBottom: -10, filter: `drop-shadow(0 0 20px ${config.accentColor}70)` }}>🔥</span>
        <p style={{ color: C.ink, fontSize: 152, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 0.9, textShadow: `0 0 70px ${config.accentColor}55, 0 0 25px ${config.accentColor}35` }}>{data.valorPrincipal}</p>
        <span style={{ color: config.accentColor, fontSize: 15, fontWeight: 800, letterSpacing: 3.5, marginTop: 10 }}>DÍAS SEGUIDOS</span>
      </div>
      {data.contexto && <InsightBlock text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} color={config.accentColor} />
    </CardShell>
  );
}

function LayoutWeek({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['week'] }) {
  return (
    <CardShell glow={config.accentColor} disciplina="crossfit">
      <Particles color={config.accentColor} />
      <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '38px 34px 0' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${config.accentColor}14`, border: `1px solid ${config.accentColor}40`, borderRadius: 100, padding: '5px 13px' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: config.accentColor }} />
            <span style={{ color: config.accentColor, fontSize: 10.5, fontWeight: 800, letterSpacing: 1.8 }}>SEMANA COMPLETADA</span>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 34px' }}>
          <p style={{ color: C.ink, fontSize: 80, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, margin: 0, textShadow: `0 0 60px ${config.accentColor}45` }}>{data.valorPrincipal}</p>
          <p style={{ color: config.accentColor, fontSize: 17, fontWeight: 700, marginTop: 12 }}>100% de adherencia</p>
        </div>
      </div>
      {data.contexto && <InsightBlock text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} color={config.accentColor} />
    </CardShell>
  );
}

const LAYOUT_MAP: Record<AchievementType, any> = {
  pr: LayoutPR,
  pr_absoluto: LayoutPR,
  goal: LayoutGoal,
  streak: LayoutStreak,
  week: LayoutWeek,
  milestone: LayoutPR,
};

function ForgeCard({ data }: { data: ForgeCardData }) {
  const config = ACHIEVEMENT_CONFIG[data.achievementType];
  const Layout = LAYOUT_MAP[data.achievementType];
  return <Layout data={data} config={config} />;
}

export default function ForgeCardsGenerator({ initialData, onClose }: { initialData: ForgeCardData; onClose?: () => void }) {
  const [data] = useState<ForgeCardData>(initialData);
  const [descargando, setDescargando] = useState(false);

  const descargarCard = async () => {
    setDescargando(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const el = document.getElementById('forge-card-export');
      if (!el) return;
      const canvas = await html2canvas(el, { backgroundColor: null, scale: 2 });
      const link = document.createElement('a');
      link.download = `forge-card-${data.achievementType}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, flexDirection: 'column', gap: 20, padding: 24 }}>
      {onClose && (
        <button onClick={onClose} style={{ position: 'absolute', top: 24, right: 24, background: '#141414', border: `1px solid ${C.border}`, borderRadius: 100, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={18} color={C.ink} />
        </button>
      )}
      <div id="forge-card-export">
        <ForgeCard data={data} />
      </div>
      <button onClick={descargarCard} disabled={descargando} style={{
        display: 'flex', alignItems: 'center', gap: 8, background: C.accent, color: '#fff', border: 'none',
        borderRadius: 100, padding: '14px 32px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
        boxShadow: `0 10px 30px -8px ${C.accent}70`,
      }}>
        <Download size={16} />
        {descargando ? 'Descargando...' : 'Descargar imagen'}
      </button>
    </div>
  );
}
