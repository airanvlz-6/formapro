import { cn } from "@/lib/utils";

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  narrow?: boolean;
}

export default function Section({
  children,
  className,
  id,
  narrow = false,
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "relative w-full",
        "px-6 md:px-10",
        "py-20 md:py-28",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto w-full",
          narrow ? "max-w-4xl" : "max-w-7xl"
        )}
      >
        {children}
      </div>
    </section>
  );
}