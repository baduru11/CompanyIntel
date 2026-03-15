import { cn } from "../../lib/utils"

export function ShimmerText({ children, className, shimmerWidth = 100, ...props }) {
  return (
    <span
      style={{ "--shimmer-width": `${shimmerWidth}px` }}
      className={cn(
        "inline-block bg-clip-text text-transparent",
        "bg-[length:var(--shimmer-width)_100%] bg-no-repeat",
        "bg-gradient-to-r from-neutral-400 via-white/80 to-neutral-400",
        "animate-[shimmer_2s_ease-in-out_infinite]",
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
