import { Inbox } from "lucide-react";
export default function EmptyState({ message }: { message: string }) {
  return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-16 text-slate-400"><Inbox className="mb-2 h-10 w-10" /><p className="text-sm">{message}</p></div>;
}
