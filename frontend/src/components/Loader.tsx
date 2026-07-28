interface LoaderProps {
  fullScreen?: boolean
  size?: "sm" | "md" | "lg"
}

const sizeMap = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-[3px]",
  lg: "h-12 w-12 border-[3px]",
}

function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`${sizeMap[size]} animate-spin rounded-full border-[var(--primary)] border-r-transparent border-b-transparent`} />
  )
}

export default function Loader({ fullScreen = false, size = "md" }: LoaderProps) {
  if (fullScreen) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size={size} />
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center py-16">
      <Spinner size={size} />
    </div>
  )
}
