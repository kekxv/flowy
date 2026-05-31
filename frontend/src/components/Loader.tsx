interface LoaderProps {
  fullScreen?: boolean
  size?: "sm" | "md" | "lg"
}

const sizeMap = { sm: "h-4 w-4 border-2", md: "h-8 w-8 border-4", lg: "h-12 w-12 border-[3px]" }

export default function Loader({ fullScreen = false, size = "md" }: LoaderProps) {
  if (fullScreen) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className={`${sizeMap[size]} animate-spin rounded-full border-blue-600 border-t-transparent`} />
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center pt-16">
      <div className={`${sizeMap[size]} animate-spin rounded-full border-blue-600 border-t-transparent`} />
    </div>
  )
}
