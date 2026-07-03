interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}

export default function SectionTitle({
  eyebrow,
  title,
  subtitle,
  center = false,
}: Props) {
  return (
    <div
      className={`space-y-6 ${
        center ? "text-center mx-auto max-w-3xl" : ""
      }`}
    >
      {eyebrow && (
        <p className="uppercase tracking-[0.25em] text-orange-500 text-sm font-semibold">
          {eyebrow}
        </p>
      )}

      <h2 className="text-4xl md:text-6xl font-bold leading-tight text-white">
        {title}
      </h2>

      {subtitle && (
        <p className="text-zinc-400 text-lg leading-8">
          {subtitle}
        </p>
      )}
    </div>
  );
}