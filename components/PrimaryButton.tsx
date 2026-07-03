import { ArrowRight } from "lucide-react";

export default function PrimaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="
      group
      inline-flex
      items-center
      gap-3
      rounded-full
      bg-orange-500
      hover:bg-orange-400
      px-7
      py-4
      font-semibold
      text-white
      transition-all
      duration-300
      hover:scale-105
      "
    >
      {children}

      <ArrowRight
        size={18}
        className="
        transition-transform
        duration-300
        group-hover:translate-x-1
        "
      />
    </button>
  );
}