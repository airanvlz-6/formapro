import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
}

export default function GlassCard({
  children,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl",
        "border border-orange-500/20",
        "bg-white/[0.03]",
        "backdrop-blur-xl",
        "shadow-[0_0_60px_rgba(255,122,0,0.08)]",
        "transition-all duration-500",
        "hover:border-orange-400/50",
        "hover:-translate-y-1",
        className
      )}
    >
      {children}
    </div>
  );
}