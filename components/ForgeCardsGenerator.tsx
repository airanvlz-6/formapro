import { useState } from 'react';
import { Download, X } from 'lucide-react';

const C = {
  bg: '#060605',
  ink: '#F7F4EE',
  muted: '#5C5850',
  faint: '#38352F',
  accent: '#FF6B00',
  gold: '#D4AF37',
  green: '#4ADE80',
  border: '#1A1A1A',
};

type AchievementType = 'pr' | 'pr_absoluto' | 'goal' | 'streak' | 'week' | 'milestone';

interface ForgeCardData {
  achievementType: AchievementType;
  titulo: string;
  valorPrincipal: string;
  unidad?: string;
  subtitulo?: string;
  detalle?: string;
  badge?: string;
  fecha: string;
  contexto?: string;
  disciplina?: string;
  progresion?: { valor: number; fecha: string }[];
}

const ACHIEVEMENT_CONFIG: Record<AchievementType, { label: string; accentColor: string; icon: string }> = {
  pr: { label: 'NUEVO PR', accentColor: C.accent, icon: '🏆' },
  pr_absoluto: { label: 'RÉCORD HISTÓRICO', accentColor: C.gold, icon: '👑' },
  goal: { label: 'OBJETIVO CONSEGUIDO', accentColor: C.green, icon: '🎯' },
  streak: { label: 'RACHA', accentColor: C.accent, icon: '🔥' },
  week: { label: 'SEMANA COMPLETADA', accentColor: C.green, icon: '✅' },
  milestone: { label: 'HITO', accentColor: C.gold, icon: '✨' },
};

// ============================================================
// CAPA 1 — BACKGROUND ASSETS: SVG detallado por disciplina.
// Elementos artisticos (disco, silueta, barra) — NUNCA datos dinamicos aqui.
// ============================================================
function BackgroundFuerza({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 480 480" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid slice">
      <g transform="translate(260,-50)" stroke={color} fill="none" strokeWidth="1.3">
        <circle cx="200" cy="200" r="180" opacity="0.22" />
        <circle cx="200" cy="200" r="150" opacity="0.18" />
        <circle cx="200" cy="200" r="120" opacity="0.16" />
        <circle cx="200" cy="200" r="90" opacity="0.14" />
        <circle cx="200" cy="200" r="45" opacity="0.22" />
        <circle cx="200" cy="200" r="14" opacity="0.28" fill={color} fillOpacity="0.05" />
        <line x1="200" y1="20" x2="200" y2="380" opacity="0.08" />
        <line x1="20" y1="200" x2="380" y2="200" opacity="0.08" />
        <line x1="60" y1="60" x2="340" y2="340" opacity="0.06" />
        <line x1="340" y1="60" x2="60" y2="340" opacity="0.06" />
        <path id="fcCirclePath" d="M 200,20 A 180,180 0 0,1 380,200" fill="none" />
        <text fontFamily="'DM Sans', sans-serif" fontSize="12" fill={color} fillOpacity="0.18" letterSpacing="6" fontWeight="700">
          <textPath href="#fcCirclePath" startOffset="12%">FORGE STRENGTH</textPath>
        </text>
      </g>
      <g transform="translate(-70,330) rotate(-8)" stroke={color} fill="none" strokeWidth="1.4" opacity="0.16">
        <line x1="0" y1="0" x2="260" y2="0" />
        <circle cx="30" cy="0" r="20" />
        <circle cx="30" cy="0" r="26" />
        <line x1="0" y1="-26" x2="0" y2="26" />
        <line x1="10" y1="-20" x2="10" y2="20" />
      </g>
      <g transform="translate(10,300)" stroke={color} fill="none" strokeWidth="1.3" opacity="0.12">
        <path d="M60 40 Q65 20 80 20 Q92 20 92 32 Q92 42 82 45 L82 70 Q95 78 100 95 L100 130 M82 70 L60 78 L60 130 M60 78 Q40 85 25 100 M92 42 L140 42 M92 55 L145 60" />
        <circle cx="83" cy="24" r="9" />
      </g>
    </svg>
  );
}

function BackgroundCarrera({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 480 480" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid slice">
      <g stroke={color} fill="none" strokeWidth="1.2" opacity="0.14">
        <path d="M-20 340 Q100 300 160 320 Q220 340 260 280 Q300 220 380 200 Q440 185 500 210" />
        <path d="M-20 380 Q120 350 190 375 Q250 395 300 340 Q350 285 430 265 Q480 250 520 270" opacity="0.6" />
        <path d="M-20 420 Q140 400 220 415 Q280 428 330 390 Q380 350 460 335" opacity="0.4" />
      </g>
      <g transform="translate(300,40)" stroke={color} fill="none" strokeWidth="1.3" opacity="0.15">
        <path d="M40 30 Q45 15 58 15 Q68 15 68 25 Q68 33 60 36 L58 55 Q70 62 75 78 L78 105 M58 55 L40 62 L38 105 M40 62 Q22 68 10 82" />
        <circle cx="60" cy="19" r="7" />
      </g>
      <g stroke={color} fill="none" strokeWidth="1" opacity="0.1">
        <circle cx="220" cy="180" r="4" fill={color} fillOpacity="0.2" />
        <circle cx="220" cy="180" r="14" />
        <circle cx="220" cy="180" r="26" />
      </g>
    </svg>
  );
}

function BackgroundCrossfit({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 480 480" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid slice">
      <g stroke={color} fill="none" strokeWidth="1.3" opacity="0.14">
        <rect x="70" y="60" width="340" height="280" />
        <line x1="70" y1="200" x2="410" y2="200" />
        <line x1="150" y1="60" x2="150" y2="30" />
        <line x1="330" y1="60" x2="330" y2="30" />
        <line x1="150" y1="30" x2="330" y2="30" />
        <path d="M200 200 Q215 240 200 270" opacity="0.5" />
        <path d="M280 200 Q265 240 280 270" opacity="0.5" />
      </g>
    </svg>
  );
}

function BackgroundGenerico({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 480 480" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid slice">
      <g stroke={color} fill="none" strokeWidth="1.2" opacity="0.14">
        <path d="M240 60 L272 175 L390 175 L296 245 L330 360 L240 292 L150 360 L184 245 L90 175 L208 175 Z" />
      </g>
    </svg>
  );
}

const BACKGROUND_MAP: Record<string, any> = {
  fuerza: BackgroundFuerza,
  halterofilia: BackgroundFuerza,
  carrera: BackgroundCarrera,
  crossfit: BackgroundCrossfit,
  ciclismo: BackgroundCarrera,
  generico: BackgroundGenerico,
};

// ============================================================
// CAPA 2 — OVERLAY: glow, particulas, esquineras (decorativo, reutilizable)
// ============================================================
function Corners({ color }: { color: string }) {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <path d="M24 44 L24 24 L44 24" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
      <path d="M436 456 L456 456 L456 436" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
    </svg>
  );
}

function NumberHalo({ color }: { color: string }) {
  return (
    <div style={{
      position: 'absolute', left: '52%', top: '46%', transform: 'translate(-50%,-50%)',
      width: 440, height: 300, borderRadius: '50%',
      background: `radial-gradient(ellipse, ${color}2A 0%, ${color}10 45%, transparent 72%)`,
      zIndex: 0,
    }} />
  );
}

function Sparks({ color }: { color: string }) {
  const pts = [[365, 400, 0], [400, 420, 0.5], [385, 440, 1], [355, 425, 1.4]];
  return (
    <>
      <style>{`@keyframes fcSpark{0%,100%{opacity:0.2;transform:scale(0.6)}50%{opacity:1;transform:scale(1.1)}}`}</style>
      {pts.map(([x, y, d], i) => (
        <div key={i} style={{ position: 'absolute', left: x, top: y, width: 3, height: 3, borderRadius: '50%', background: color, boxShadow: `0 0 8px 2px ${color}`, animation: `fcSpark 2.2s ease-in-out ${d}s infinite`, zIndex: 2 }} />
      ))}
    </>
  );
}

// ============================================================
// CAPA 3 — DYNAMIC DATA: todo lo que React controla con datos reales
// ============================================================
function TitleBlock({ titulo, color }: { titulo: string; color: string }) {
  return (
    <div style={{ position: 'absolute', top: 30, left: 36, zIndex: 3 }}>
      <p style={{ color, fontSize: 11, fontWeight: 800, letterSpacing: 2.5, marginBottom: 8 }}>NUEVO PR</p>
      <div style={{ width: 34, height: 2, background: color, borderRadius: 2, marginBottom: 10 }} />
      <p style={{ color: C.muted, fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>{titulo}</p>
    </div>
  );
}

function Footer({ fecha }: { fecha: string }) {
  return (
    <div style={{ position: 'absolute', bottom: 24, left: 36, right: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <img src="/logo-forge.png" alt="" style={{ width: 15, height: 15, objectFit: 'contain' }} />
        <span style={{ color: C.ink, fontSize: 10, fontWeight: 800, letterSpacing: 2, opacity: 0.7 }}>FORGE</span>
      </div>
      <span style={{ color: C.faint, fontSize: 9, letterSpacing: 0.4 }}>{fecha}</span>
    </div>
  );
}

function InsightCapsule({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ position: 'relative', zIndex: 3, margin: '0 36px 60px', background: `${color}08`, border: `1px solid ${color}30`, borderRadius: 14, padding: '13px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 16 }}>🧠</span>
      <div>
        <p style={{ color, fontSize: 9, fontWeight: 800, letterSpacing: 1, marginBottom: 3 }}>FORGE INSIGHT</p>
        <p style={{ color: C.ink, fontSize: 12, lineHeight: 1.45, opacity: 0.92 }}>{text}</p>
      </div>
    </div>
  );
}

function ProgressionTimeline({ items, color }: { items: { valor: number; fecha: string }[]; color: string }) {
  return (
    <div style={{ position: 'relative', zIndex: 3, margin: '0 36px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
        {items.map((it, i) => {
          const esUltimo = i === items.length - 1;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <p style={{
                  color: esUltimo ? C.ink : C.muted, fontFamily: 'Georgia, serif', fontWeight: 800,
                  fontSize: esUltimo ? 24 : 18, lineHeight: 1, marginBottom: 2,
                  textShadow: esUltimo ? `0 0 20px ${color}70` : 'none',
                }}>{it.valor}<span style={{ fontSize: esUltimo ? 11 : 9, fontWeight: 700 }}> kg</span></p>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: esUltimo ? color : C.faint, margin: '6px auto', boxShadow: esUltimo ? `0 0 10px ${color}` : 'none' }} />
                <p style={{ color: esUltimo ? color : C.faint, fontSize: 8, fontWeight: esUltimo ? 800 : 600, letterSpacing: 0.5 }}>{it.fecha}</p>
              </div>
              {i < items.length - 1 && <span style={{ color: C.faint, fontSize: 11, marginBottom: 20 }}>›</span>}
            </div>
          );
        })}
      </div>
      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${C.faint}, ${color}60)`, marginTop: 10 }} />
    </div>
  );
}

// ============================================================
// COMPOSICION FINAL — todas las capas juntas
// ============================================================
function CardShell({ children, disciplina, color }: { children: React.ReactNode; disciplina: string; color: string }) {
  const Background = BACKGROUND_MAP[disciplina] || BACKGROUND_MAP.generico;
  return (
    <div style={{
      width: 480, height: 480, background: `linear-gradient(150deg, #0A0A09 0%, ${C.bg} 55%)`,
      borderRadius: 26, position: 'relative', overflow: 'hidden',
      fontFamily: "'DM Sans', sans-serif",
      boxShadow: `0 40px 100px -30px rgba(0,0,0,0.7)`,
    }}>
      <Background color={color} />
      <Corners color={color} />
      {children}
    </div>
  );
}

function LayoutPR({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['pr'] }) {
  return (
    <CardShell disciplina={data.disciplina || 'generico'} color={config.accentColor}>
      <NumberHalo color={config.accentColor} />
      <Sparks color={config.accentColor} />
      <TitleBlock titulo={data.titulo} color={config.accentColor} />
      <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 30 }}>
        <div style={{ padding: '0 36px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ color: C.ink, fontSize: 120, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 0.85, textShadow: `0 0 40px ${config.accentColor}40` }}>{data.valorPrincipal}</span>
            {data.unidad && <span style={{ color: C.muted, fontSize: 30, fontWeight: 700, fontFamily: 'Georgia, serif' }}>{data.unidad}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <span style={{ fontSize: 15 }}>{config.icon}</span>
            <span style={{ color: config.accentColor, fontSize: 12, fontWeight: 800, letterSpacing: 1.5 }}>{config.label}</span>
            <div style={{ flex: 1, height: 1, background: `${config.accentColor}30` }} />
          </div>
          {data.badge && <p style={{ color: C.muted, fontSize: 13, fontWeight: 600, marginTop: 8 }}>{data.badge}</p>}
        </div>
      </div>
      {data.progresion && data.progresion.length >= 2 && (
        <ProgressionTimeline items={data.progresion} color={config.accentColor} />
      )}
      {data.contexto && <InsightCapsule text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} />
    </CardShell>
  );
}

function LayoutGoal({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['goal'] }) {
  return (
    <CardShell disciplina={data.disciplina || 'generico'} color={config.accentColor}>
      <NumberHalo color={config.accentColor} />
      <Sparks color={config.accentColor} />
      <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 44px' }}>
        <span style={{ fontSize: 38 }}>✓</span>
        <p style={{ color: C.muted, fontSize: 15, fontWeight: 600, margin: '16px 0 6px', maxWidth: 330, lineHeight: 1.4 }}>{data.subtitulo}</p>
        <p style={{ color: C.ink, fontSize: 74, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, textShadow: `0 0 40px ${config.accentColor}40` }}>{data.valorPrincipal}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <span style={{ fontSize: 14 }}>{config.icon}</span>
          <span style={{ color: config.accentColor, fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>{config.label}</span>
        </div>
      </div>
      {data.contexto && <InsightCapsule text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} />
    </CardShell>
  );
}

function LayoutStreak({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['streak'] }) {
  return (
    <CardShell disciplina="generico" color={config.accentColor}>
      <NumberHalo color={config.accentColor} />
      <Sparks color={config.accentColor} />
      <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 40, filter: `drop-shadow(0 0 24px ${config.accentColor}80)` }}>🔥</span>
        <p style={{ color: C.ink, fontSize: 152, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 0.85, textShadow: `0 0 50px ${config.accentColor}45` }}>{data.valorPrincipal}</p>
        <span style={{ color: config.accentColor, fontSize: 14, fontWeight: 800, letterSpacing: 4 }}>DÍAS SEGUIDOS</span>
      </div>
      {data.contexto && <InsightCapsule text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} />
    </CardShell>
  );
}

function LayoutWeek({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['week'] }) {
  return (
    <CardShell disciplina="crossfit" color={config.accentColor}>
      <NumberHalo color={config.accentColor} />
      <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: C.ink, fontSize: 96, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 0.9, textShadow: `0 0 40px ${config.accentColor}40` }}>{data.valorPrincipal}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <span style={{ fontSize: 14 }}>{config.icon}</span>
          <span style={{ color: config.accentColor, fontSize: 12, fontWeight: 800, letterSpacing: 1.5 }}>{config.label}</span>
        </div>
        <p style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>100% de adherencia</p>
      </div>
      {data.contexto && <InsightCapsule text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} />
    </CardShell>
  );
}

const LAYOUT_MAP: Record<AchievementType, any> = {
  pr: LayoutPR, pr_absoluto: LayoutPR, goal: LayoutGoal, streak: LayoutStreak, week: LayoutWeek, milestone: LayoutPR,
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, flexDirection: 'column', gap: 20, padding: 24 }}>
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
