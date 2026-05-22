import { useEffect, useMemo, useState } from "react";
import type { AiPromptTemplate } from "@/lib/aiPromptTypes";

type PromptDraft = AiPromptTemplate & {
  saving: boolean;
  saveError: string | null;
};

type AiPromptManagerProps = {
  canEdit: boolean;
};

function byScope(prompts: PromptDraft[]) {
  return prompts.reduce<Record<string, PromptDraft[]>>((acc, prompt) => {
    if (!acc[prompt.scope]) acc[prompt.scope] = [];
    acc[prompt.scope].push(prompt);
    return acc;
  }, {});
}

export default function AiPromptManager({ canEdit }: AiPromptManagerProps) {
  const [prompts, setPrompts] = useState<PromptDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadPrompts = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/ai-prompts");
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load prompts.");
        }

        if (!active) return;
        setPrompts(
          (payload.prompts || []).map((prompt: AiPromptTemplate) => ({
            ...prompt,
            saving: false,
            saveError: null,
          })),
        );
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load prompts.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPrompts();
    return () => {
      active = false;
    };
  }, []);

  const groupedPrompts = useMemo(() => byScope(prompts), [prompts]);

  const updateDraft = (id: number, key: "system_prompt" | "user_prompt_template", value: string) => {
    setPrompts((current) =>
      current.map((prompt) => (prompt.id === id ? { ...prompt, [key]: value, saveError: null } : prompt)),
    );
  };

  const savePrompt = async (prompt: PromptDraft) => {
    if (!prompt.id) return;

    setPrompts((current) =>
      current.map((item) => (item.id === prompt.id ? { ...item, saving: true, saveError: null } : item)),
    );

    try {
      const response = await fetch(`/api/ai-prompts/${prompt.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_prompt: prompt.system_prompt,
          user_prompt_template: prompt.user_prompt_template,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to save prompt.");
      }

      setPrompts((current) =>
        current.map((item) =>
          item.id === prompt.id
            ? {
                ...payload.prompt,
                saving: false,
                saveError: null,
              }
            : item,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save prompt.";
      setPrompts((current) =>
        current.map((item) => (item.id === prompt.id ? { ...item, saving: false, saveError: message } : item)),
      );
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
        Loading AI prompts...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-900">AI Prompt Management</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Edit the exact DeepSeek system and user prompts used for each record and split field. Required placeholders
          must stay in the user prompt.
        </p>
        {!canEdit && <p className="mt-2 text-sm font-medium text-amber-700">Admin access is required to edit prompts.</p>}
      </div>

      {(["record", "split"] as const).map((scope) => {
        const scopePrompts = groupedPrompts[scope] || [];
        if (!scopePrompts.length) return null;

        return (
          <section key={scope} className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">
                {scope === "record" ? "Record Generation Prompts" : "Split Field Prompts"}
              </h3>
              <p className="text-sm text-zinc-500">
                {scope === "record"
                  ? "Used by the record summary, conclusion, and tag generation APIs."
                  : "Used by the split field AI generator in the add workflow."}
              </p>
            </div>

            <div className="grid gap-4">
              {scopePrompts.map((prompt) => (
                <div key={prompt.prompt_key} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-2 border-b border-zinc-200 pb-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-zinc-900">{prompt.title}</h4>
                      <p className="text-xs text-zinc-500">{prompt.prompt_key}</p>
                      {prompt.description && <p className="mt-1 text-sm text-zinc-600">{prompt.description}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-700">
                        {prompt.field_key}
                      </span>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-700">
                        {prompt.variant}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600">System Prompt</span>
                      <textarea
                        value={prompt.system_prompt}
                        onChange={(event) => updateDraft(prompt.id || 0, "system_prompt", event.target.value)}
                        disabled={!canEdit || prompt.saving}
                        rows={8}
                        className="min-h-[180px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none disabled:bg-zinc-50"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600">User Prompt Template</span>
                      <textarea
                        value={prompt.user_prompt_template}
                        onChange={(event) => updateDraft(prompt.id || 0, "user_prompt_template", event.target.value)}
                        disabled={!canEdit || prompt.saving}
                        rows={8}
                        className="min-h-[180px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none disabled:bg-zinc-50"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                      {prompt.required_placeholders.map((placeholder) => (
                        <span
                          key={`${prompt.prompt_key}-${placeholder}`}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700"
                        >
                          {`{{${placeholder}}}`}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      {prompt.saveError && <span className="text-xs font-medium text-rose-600">{prompt.saveError}</span>}
                      {prompt.updated_at && !prompt.saveError && (
                        <span className="text-xs text-zinc-500">
                          Updated {new Date(prompt.updated_at).toLocaleString()}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => savePrompt(prompt)}
                        disabled={!canEdit || prompt.saving}
                        className="rounded-lg border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {prompt.saving ? "Saving..." : "Save Prompt"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
