import { useState } from 'react';
import { Download, X } from 'lucide-react';

const C = {
  bg: '#050505',
  ink: '#F7F4EE',
  muted: '#5C5850',
  faint: '#3A3733',
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
  unidad?: string; // "kg", "km", "min" - se separa del numero, mas pequeño
  subtitulo?: string;
  detalle?: string;
  badge?: string; // ej: "PR #14", "31 dias desde el anterior"
  fecha: string;
  contexto?: string;
  disciplina?: string;
  progresion?: number[]; // ultimas 3-4 marcas numericas, la ultima es la actual
}

// BLUEPRINTS — un solo trazo tecnico gigante, pensado para 2-3% opacidad, ocupando toda la tarjeta
const BLUEPRINT: Record<string, string> = {
  fuerza: 'M200 40 A120 120 0 1 1 199 40 M200 75 A85 85 0 1 1 199 75 M200 105 A55 55 0 1 1 199 105 M60 240 L340 240 M200 40 L200 240 M170 240 L170 300 L230 300 L230 240',
  halterofilia: 'M200 40 A120 120 0 1 1 199 40 M200 75 A85 85 0 1 1 199 75 M200 105 A55 55 0 1 1 199 105 M60 240 L340 240 M200 40 L200 240 M170 240 L170 300 L230 300 L230 240',
  carrera: 'M40 260 Q120 180 180 200 Q230 213 250 150 L320 60 M40 300 L360 300 M75 300 L100 260 M140 300 L165 255 M205 300 L230 265 M270 300 L295 245 M320 60 L295 30 M320 60 L350 75',
  crossfit: 'M50 60 L50 300 M350 60 L350 300 M50 60 L350 60 M50 300 L350 300 M50 180 L350 180 M120 60 L120 20 M280 60 L280 20 M120 20 L280 20 M150 180 Q165 230 150 280 M250 180 Q235 230 250 280',
  ciclismo: 'M90 260 A70 70 0 1 1 90 120 A70 70 0 1 1 90 260 M310 260 A70 70 0 1 1 310 120 A70 70 0 1 1 310 260 M90 190 L200 90 L310 190 M200 90 L175 30 L245 30',
  generico: 'M200 30 L230 145 L350 145 L255 210 L290 325 L200 260 L110 325 L145 210 L50 145 L170 145 Z',
};

const ACHIEVEMENT_CONFIG: Record<AchievementType, { label: string; accentColor: string; icon: string }> = {
  pr: { label: 'NUEVO PR', accentColor: C.accent, icon: '🏆' },
  pr_absoluto: { label: 'RÉCORD HISTÓRICO', accentColor: C.gold, icon: '👑' },
  goal: { label: 'OBJETIVO CONSEGUIDO', accentColor: C.green, icon: '🎯' },
  streak: { label: 'RACHA', accentColor: C.accent, icon: '🔥' },
  week: { label: 'SEMANA COMPLETADA', accentColor: C.green, icon: '✅' },
  milestone: { label: 'HITO', accentColor: C.gold, icon: '✨' },
};

function Blueprint({ disciplina, color }: { disciplina: string; color: string }) {
  const path = BLUEPRINT[disciplina] || BLUEPRINT.generico;
  return (
    <svg viewBox="0 0 400 400" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.028, pointerEvents: 'none' }} preserveAspectRatio="xMidYMid slice">
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Halo circular grande y difuso detras del numero — al estilo Apple, no glow-de-texto
function NumberHalo({ color }: { color: string }) {
  return (
    <div style={{
      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
      width: 420, height: 420, borderRadius: '50%',
      background: `radial-gradient(circle, ${color}22 0%, ${color}0A 45%, transparent 70%)`,
      filter: 'blur(4px)', zIndex: 0,
    }} />
  );
}

function CardShell({ children, glow, disciplina }: { children: React.ReactNode; glow: string; disciplina: string }) {
  return (
    <div style={{
      width: 480, height: 480, background: C.bg,
      borderRadius: 26, position: 'relative', overflow: 'hidden',
      fontFamily: "'DM Sans', sans-serif",
      boxShadow: `0 40px 100px -30px rgba(0,0,0,0.7)`,
    }}>
      <Blueprint disciplina={disciplina} color={glow} />
      {children}
    </div>
  );
}

function TopBadge({ label, color, icon }: { label: string; color: string; icon: string }) {
  return (
    <div style={{ position: 'absolute', top: 30, left: 34, zIndex: 3, display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ color, fontSize: 10.5, fontWeight: 800, letterSpacing: 2 }}>{label}</span>
    </div>
  );
}

function Footer({ fecha }: { fecha: string }) {
  return (
    <div style={{ position: 'absolute', bottom: 24, left: 34, right: 34, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <img src="/logo-forge.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain', opacity: 0.6 }} />
        <span style={{ color: C.muted, fontSize: 9.5, fontWeight: 800, letterSpacing: 2 }}>FORGE</span>
      </div>
      <span style={{ color: C.faint, fontSize: 9, letterSpacing: 0.4 }}>{fecha}</span>
    </div>
  );
}

function InsightCapsule({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ position: 'relative', zIndex: 3, margin: '0 34px 62px', background: '#0D0D0D', border: `1px solid ${color}25`, borderRadius: 14, padding: '12px 16px' }}>
      <p style={{ color, fontSize: 9, fontWeight: 800, letterSpacing: 1.2, marginBottom: 5 }}>💡 FORGE INSIGHT</p>
      <p style={{ color: C.ink, fontSize: 12, lineHeight: 1.45, opacity: 0.9 }}>{text}</p>
    </div>
  );
}

// Barra de progresion: ultimas marcas en gris tenue, la actual en blanco brillante — cuenta la historia
function ProgressionBar({ valores, color }: { valores: number[]; color: string }) {
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const rango = max - min || 1;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 48, marginTop: 4 }}>
      {valores.map((v, i) => {
        const esUltimo = i === valores.length - 1;
        const alturaPct = 20 + ((v - min) / rango) * 80;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }}>
            <div style={{
              width: '100%', maxWidth: 26, height: `${alturaPct}%`, borderRadius: 3,
              background: esUltimo ? color : C.faint,
              boxShadow: esUltimo ? `0 0 16px ${color}70` : 'none',
            }} />
            <span style={{ fontSize: 8.5, color: esUltimo ? C.ink : C.muted, fontWeight: esUltimo ? 800 : 600 }}>{v}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---- LAYOUT PR: numero domina 60% del alto, badge junto al numero, progresion opcional ----
function LayoutPR({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['pr'] }) {
  return (
    <CardShell glow={config.accentColor} disciplina={data.disciplina || 'generico'}>
      <TopBadge label={data.titulo} color={C.muted} icon="" />
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <NumberHalo color={config.accentColor} />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
            <span style={{ color: C.ink, fontSize: 128, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 0.85 }}>{data.valorPrincipal}</span>
            {data.unidad && <span style={{ color: C.muted, fontSize: 32, fontWeight: 700, fontFamily: 'Georgia, serif' }}>{data.unidad}</span>}
          </div>
          <div style={{ width: 46, height: 2, background: config.accentColor, margin: '18px auto 14px', borderRadius: 2 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <span style={{ fontSize: 15 }}>{config.icon}</span>
            <span style={{ color: config.accentColor, fontSize: 13, fontWeight: 800, letterSpacing: 1.5 }}>{config.label}</span>
          </div>
          {data.badge && <p style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginTop: 8 }}>{data.badge}</p>}
        </div>
      </div>
      {data.progresion && data.progresion.length >= 2 && (
        <div style={{ position: 'relative', zIndex: 3, padding: '0 34px', marginBottom: data.contexto ? 18 : 62 }}>
          <ProgressionBar valores={data.progresion} color={config.accentColor} />
        </div>
      )}
      {data.contexto && <InsightCapsule text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} />
    </CardShell>
  );
}

function LayoutGoal({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['goal'] }) {
  return (
    <CardShell glow={config.accentColor} disciplina={data.disciplina || 'generico'}>
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 44px' }}>
        <NumberHalo color={config.accentColor} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span style={{ fontSize: 40 }}>✓</span>
          <p style={{ color: C.muted, fontSize: 15, fontWeight: 600, margin: '18px 0 6px', maxWidth: 330, lineHeight: 1.4 }}>{data.subtitulo}</p>
          <p style={{ color: C.ink, fontSize: 76, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1 }}>{data.valorPrincipal}</p>
          <div style={{ width: 46, height: 2, background: config.accentColor, margin: '18px auto 12px', borderRadius: 2 }} />
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
    <CardShell glow={config.accentColor} disciplina="generico">
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <NumberHalo color={config.accentColor} />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 42, filter: `drop-shadow(0 0 24px ${config.accentColor}80)` }}>🔥</span>
          <p style={{ color: C.ink, fontSize: 158, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 0.85, margin: '4px 0 0' }}>{data.valorPrincipal}</p>
          <span style={{ color: config.accentColor, fontSize: 14, fontWeight: 800, letterSpacing: 4 }}>DÍAS SEGUIDOS</span>
        </div>
      </div>
      {data.contexto && <InsightCapsule text={data.contexto} color={config.accentColor} />}
      <Footer fecha={data.fecha} />
    </CardShell>
  );
}

function LayoutWeek({ data, config }: { data: ForgeCardData; config: typeof ACHIEVEMENT_CONFIG['week'] }) {
  return (
    <CardShell glow={config.accentColor} disciplina="crossfit">
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <NumberHalo color={config.accentColor} />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <p style={{ color: C.ink, fontSize: 100, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 0.9 }}>{data.valorPrincipal}</p>
          <div style={{ width: 46, height: 2, background: config.accentColor, margin: '16px auto 12px', borderRadius: 2 }} />
          <span style={{ color: config.accentColor, fontSize: 13, fontWeight: 800, letterSpacing: 1.5 }}>{config.label}</span>
          <p style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>100% de adherencia</p>
        </div>
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
