import { useState } from 'react';
import { Download, X } from 'lucide-react';

const C = {
  bg: '#0A0A0A',
  ink: '#F5F2EC',
  muted: '#7A756E',
  accent: '#FF6B00',
  gold: '#D4AF37',
  green: '#4ADE80',
  border: '#232323',
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

const SPORT_GLYPH: Record<string, string> = {
  halterofilia: 'M20 55 L20 45 L30 45 L30 30 L15 30 L15 20 L85 20 L85 30 L70 30 L70 45 L80 45 L80 55 M15 20 A8 8 0 0 1 15 4 M85 20 A8 8 0 0 0 85 4 M15 55 A8 8 0 0 0 15 71 M85 55 A8 8 0 0 1 85 71',
  fuerza: 'M20 55 L20 45 L30 45 L30 30 L15 30 L15 20 L85 20 L85 30 L70 30 L70 45 L80 45 L80 55 M15 20 A8 8 0 0 1 15 4 M85 20 A8 8 0 0 0 85 4 M15 55 A8 8 0 0 0 15 71 M85 55 A8 8 0 0 1 85 71',
  carrera: 'M10 80 Q30 60 45 65 Q55 68 60 55 L75 30 M75 30 L65 20 M75 30 L88 35 M45 65 L35 85 M45 65 L55 82 M60 55 L50 45 L58 25',
  crossfit: 'M15 30 L85 30 M15 30 A10 10 0 0 1 15 10 M85 30 A10 10 0 0 0 85 10 M15 30 L15 55 M85 30 L85 55 M15 55 L35 75 M85 55 L65 75 M35 75 L65 75',
  ciclismo: 'M20 75 A15 15 0 1 1 20 45 A15 15 0 1 1 20 75 M80 75 A15 15 0 1 1 80 45 A15 15 0 1 1 80 75 M20 60 L50 30 L80 60 M50 30 L45 15 L60 15',
  generico: 'M50 10 L58 38 L88 38 L64 56 L72 84 L50 66 L28 84 L36 56 L12 38 L42 38 Z',
};

const ACHIEVEMENT_CONFIG: Record<AchievementType, { label: string; accentColor: string; glyphOpacity: number }> = {
  pr: { label: 'NUEVO PR', accentColor: C.accent, glyphOpacity: 0.05 },
  pr_absoluto: { label: 'RÉCORD HISTÓRICO', accentColor: C.gold, glyphOpacity: 0.06 },
  goal: { label: 'OBJETIVO', accentColor: C.green, glyphOpacity: 0.05 },
  streak: { label: 'RACHA', accentColor: C.accent, glyphOpacity: 0 },
  week: { label: 'SEMANA', accentColor: C.green, glyphOpacity: 0 },
  milestone: { label: 'HITO', accentColor: C.gold, glyphOpacity: 0.05 },
};

function SportGlyph({ disciplina, color, opacity }: { disciplina: string; color: string; opacity: number }) {
  if (opacity === 0) return null;
  const path = SPORT_GLYPH[disciplina] || SPORT_GLYPH.generico;
  return (
    <svg viewBox="0 0 100 90" style={{ position: 'absolute', right: -30, top: -10, width: 340, height: 300, opacity }}>
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CardShell({ children, glow }: { children: React.ReactNode; glow: string }) {
  return (
    <div style={{
      width: 480, height: 480, background: C.bg,
      borderRadius: 28, position: 'relative', overflow: 'hidden',
      fontFamily: "'DM Sans', sans-serif",
      boxShadow: `0 0 120px -20px ${glow}30, inset 0 1px 0 rgba(255,255,255,0.03)`,
      border: `1px solid ${C.border}`,
    }}>
      {children}
    </div>
  );
}

function Footer({ fecha }: { fecha: string }) {
  return (
    <div style={{ position: 'absolute', bottom: 24, left: 32, right: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <img src="/logo-forge.png" alt="" style={{ width: 15, height: 15, objectFit: 'contain', opacity: 0.9 }} />
        <span style={{ color: C.ink, fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, opacity: 0.75 }}>FORGE</span>
      </div>
      <span style={{ color: C.muted, fontSize: 9.5, letterSpacing: 0.3 }}>{fecha}</span>
    </div>
  );
}

function InsightBlock({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ position: 'absolute', bottom: 62, left: 32, right: 32, zIndex: 2 }}>
      <div style={{ height: 1, background: `${color}30`, marginBottom: 12 }} />
      <p style={{ color: C.ink, fontSize: 12.5, lineHeight: 1.55, opacity: 0.92 }}>{text}</p>
    </div>
  );
}

function LayoutPR({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['pr'] }) {
  return (
    <CardShell glow={config.accentColor}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 400px 300px at 85% -10%, ${config.accentColor}18, transparent 60%)` }} />
      <SportGlyph disciplina={data.disciplina || 'generico'} color={config.accentColor} opacity={config.glyphOpacity} />
      <div style={{ position: 'relative', zIndex: 2, padding: '36px 32px 0' }}>
        <span style={{ color: config.accentColor, fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>{config.label}</span>
      </div>
      <div style={{ position: 'absolute', top: 130, left: 32, right: 32, zIndex: 2 }}>
        <p style={{ color: C.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 }}>{data.titulo}</p>
        <p style={{ color: C.ink, fontSize: 88, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 0.95, margin: '2px 0 6px' }}>{data.valorPrincipal}</p>
        {data.detalle && <p style={{ color: config.accentColor, fontSize: 18, fontWeight: 800 }}>▲ {data.detalle}</p>}
      </div>
      {data.contexto && <InsightBlock text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} />
    </CardShell>
  );
}

function LayoutGoal({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['goal'] }) {
  return (
    <CardShell glow={config.accentColor}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 500px 400px at 50% 0%, ${config.accentColor}14, transparent 65%)` }} />
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 40px' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', border: `2px solid ${config.accentColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <span style={{ color: config.accentColor, fontSize: 26, fontWeight: 900 }}>✓</span>
        </div>
        <span style={{ color: config.accentColor, fontSize: 11, fontWeight: 800, letterSpacing: 2, marginBottom: 10 }}>OBJETIVO CONSEGUIDO</span>
        <p style={{ color: C.muted, fontSize: 15, fontWeight: 600, marginBottom: 4, maxWidth: 320 }}>{data.subtitulo}</p>
        <p style={{ color: C.ink, fontSize: 64, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, margin: '6px 0' }}>{data.valorPrincipal}</p>
      </div>
      {data.contexto && <InsightBlock text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} />
    </CardShell>
  );
}

function LayoutStreak({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['streak'] }) {
  return (
    <CardShell glow={config.accentColor}>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${config.accentColor}12, transparent 55%)` }} />
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 34, marginBottom: -8 }}>🔥</span>
        <p style={{ color: C.ink, fontSize: 148, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 0.9 }}>{data.valorPrincipal}</p>
        <span style={{ color: config.accentColor, fontSize: 15, fontWeight: 800, letterSpacing: 3, marginTop: 4 }}>DÍAS SEGUIDOS</span>
      </div>
      {data.contexto && <InsightBlock text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} />
    </CardShell>
  );
}

function LayoutWeek({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['week'] }) {
  return (
    <CardShell glow={config.accentColor}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 400px 300px at 10% 0%, ${config.accentColor}12, transparent 60%)` }} />
      <div style={{ position: 'relative', zIndex: 2, padding: '36px 32px 0' }}>
        <span style={{ color: config.accentColor, fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>SEMANA COMPLETADA</span>
        <p style={{ color: C.ink, fontSize: 72, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, margin: '10px 0 4px' }}>{data.valorPrincipal}</p>
        <p style={{ color: config.accentColor, fontSize: 16, fontWeight: 700 }}>100% de adherencia</p>
      </div>
      {data.contexto && <InsightBlock text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} />
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, flexDirection: 'column', gap: 20, padding: 24 }}>
      {onClose && (
        <button onClick={onClose} style={{ position: 'absolute', top: 24, right: 24, background: '#151515', border: `1px solid ${C.border}`, borderRadius: 100, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={18} color={C.ink} />
        </button>
      )}
      <div id="forge-card-export">
        <ForgeCard data={data} />
      </div>
      <button onClick={descargarCard} disabled={descargando} style={{
        display: 'flex', alignItems: 'center', gap: 8, background: C.accent, color: '#fff', border: 'none',
        borderRadius: 100, padding: '14px 32px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
      }}>
        <Download size={16} />
        {descargando ? 'Descargando...' : 'Descargar imagen'}
      </button>
    </div>
  );
}
