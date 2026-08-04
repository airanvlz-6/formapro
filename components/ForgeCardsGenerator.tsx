import { useState } from 'react';
import { Trophy, Flame, Target, CheckCircle2, Download, X, Sparkles } from 'lucide-react';

const C = {
  bg: '#0D0D0D',
  card: '#151515',
  ink: '#F0EDE8',
  muted: '#8A857E',
  accent: '#FF6B00',
  gold: '#D4AF37',
  green: '#4CAF50',
  border: '#262626',
};

// Arquitectura escalable: un unico tipo "achievement" con variantes, en vez de un tipo de
// tarjeta distinto por cada logro. Facilita añadir nuevos hitos (Primer Muscle Up, 100
// entrenamientos, 1 año entrenando...) sin crecer el componente.
type AchievementType = 'pr' | 'pr_absoluto' | 'goal' | 'streak' | 'week' | 'milestone';

interface ForgeCardData {
  achievementType: AchievementType;
  titulo: string;        // ej: "BACK SQUAT", "OBJETIVO CONSEGUIDO"
  valorPrincipal: string; // ej: "160 kg", "24:42", "14"
  subtitulo?: string;     // ej: "Nuevo récord personal", "días consecutivos"
  detalle?: string;       // ej: "+5 kg vs anterior"
  badge?: string;         // ej: "PR #12", "Semana 8 del bloque"
  fecha: string;          // ej: "04 AGO 2026"
  contexto?: string;      // Forge Insight generado por IA
}

const ACHIEVEMENT_CONFIG: Record<AchievementType, { icon: any; label: string; accentColor: string }> = {
  pr: { icon: Trophy, label: 'NUEVO PR', accentColor: C.accent },
  pr_absoluto: { icon: Trophy, label: 'RÉCORD HISTÓRICO', accentColor: C.gold },
  goal: { icon: Target, label: 'OBJETIVO CONSEGUIDO', accentColor: C.green },
  streak: { icon: Flame, label: 'RACHA', accentColor: C.accent },
  week: { icon: CheckCircle2, label: 'SEMANA COMPLETADA', accentColor: C.green },
  milestone: { icon: Sparkles, label: 'HITO', accentColor: C.gold },
};

function BackgroundPattern({ color }: { color: string }) {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
      <defs>
        <pattern id="diagonalLines" width="32" height="32" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="32" stroke={color} strokeWidth="1" opacity="0.06" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#diagonalLines)" />
    </svg>
  );
}

function Sparkle({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, fontSize: 14, opacity: 0.7,
      animation: `forgeSparkle 2.4s ease-in-out ${delay}s infinite`,
    }}>✨</div>
  );
}

function ForgeCard({ data }: { data: ForgeCardData }) {
  const config = ACHIEVEMENT_CONFIG[data.achievementType];
  const Icon = config.icon;
  const esCelebracion = data.achievementType === 'pr' || data.achievementType === 'pr_absoluto' || data.achievementType === 'milestone';

  return (
    <div style={{
      width: 480, height: 480,
      background: `radial-gradient(ellipse at top right, ${config.accentColor}10, ${C.bg} 55%)`,
      border: `1px solid ${C.border}`, borderRadius: 24, padding: '28px 32px',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      fontFamily: "'DM Sans', sans-serif", position: 'relative', overflow: 'hidden',
    }}>
      <style>{`@keyframes forgeSparkle{0%,100%{opacity:0;transform:scale(0.6) translateY(0)}50%{opacity:0.9;transform:scale(1) translateY(-4px)}}`}</style>
      <BackgroundPattern color={config.accentColor} />
      {esCelebracion && (
        <>
          <Sparkle x={40} y={60} delay={0} />
          <Sparkle x={420} y={90} delay={0.6} />
          <Sparkle x={400} y={200} delay={1.2} />
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon size={13} color={config.accentColor} />
          <span style={{ color: config.accentColor, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2 }}>{config.label}</span>
        </div>
        <span style={{ color: C.muted, fontSize: 10, letterSpacing: 0.5 }}>{data.fecha}</span>
      </div>

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
        <p style={{ color: C.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5 }}>{data.titulo}</p>
        <p style={{ color: C.ink, fontSize: 76, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1, margin: '4px 0' }}>{data.valorPrincipal}</p>
        {data.detalle && (
          <p style={{ color: config.accentColor, fontSize: 17, fontWeight: 700 }}>{data.detalle}</p>
        )}
        {data.subtitulo && (
          <p style={{ color: C.muted, fontSize: 14, marginTop: data.detalle ? 0 : 4 }}>{data.subtitulo}</p>
        )}
        {data.badge && (
          <div style={{ display: 'inline-flex', marginTop: 10, background: `${config.accentColor}15`, border: `1px solid ${config.accentColor}35`, borderRadius: 100, padding: '5px 12px', width: 'fit-content' }}>
            <span style={{ color: config.accentColor, fontSize: 11, fontWeight: 700 }}>{data.badge}</span>
          </div>
        )}
      </div>

      {data.contexto && (
        <div style={{ position: 'relative', zIndex: 1, background: `${config.accentColor}0C`, border: `1px solid ${config.accentColor}25`, borderRadius: 14, padding: '12px 14px', marginBottom: 4 }}>
          <p style={{ color: config.accentColor, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>💡 FORGE INSIGHT</p>
          <p style={{ color: C.ink, fontSize: 13, lineHeight: 1.5 }}>{data.contexto}</p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src="/logo-forge.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
          <span style={{ color: C.ink, fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.85 }}>FORGE</span>
        </div>
        <span style={{ color: C.muted, fontSize: 10 }}>forgeapp.es</span>
      </div>
    </div>
  );
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, flexDirection: 'column', gap: 20, padding: 24 }}>
      {onClose && (
        <button onClick={onClose} style={{ position: 'absolute', top: 24, right: 24, background: C.card, border: `1px solid ${C.border}`, borderRadius: 100, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
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
