import { useState } from "react";
import { Loader2 } from "lucide-react";

interface SiteFormProps {
  onSubmit: (data: { label: string; url: string; username: string; appPassword: string }) => void;
  loading?: boolean;
}

export function SiteForm({ onSubmit, loading }: SiteFormProps) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");

  const canSubmit = label.trim() && url.trim() && username.trim() && appPassword.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    onSubmit({ label: label.trim(), url: url.trim(), username: username.trim(), appPassword: appPassword.trim() });
  };

  const inputClass = "w-full rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/30 placeholder:text-zinc-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-1">Label</label>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My WordPress Site" className={inputClass} />
      </div>
      <div>
        <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-1">Site URL</label>
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className={inputClass} />
      </div>
      <div>
        <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-1">Username</label>
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" className={inputClass} />
      </div>
      <div>
        <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-1">Application Password</label>
        <input type="password" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" className={inputClass} />
        <p className="text-[10px] text-zinc-500 mt-1">Generate at WordPress → Users → Application Passwords</p>
      </div>
      <button
        type="submit"
        disabled={!canSubmit || loading}
        className="w-full flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading && <Loader2 size={12} className="animate-spin" />}
        Add Site
      </button>
    </form>
  );
}
