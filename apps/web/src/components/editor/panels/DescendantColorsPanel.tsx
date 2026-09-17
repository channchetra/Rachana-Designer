import { ColorInput } from "../ColorInput";
import { DescendantStyleInfo } from "@/types/editor";
import { getEffectiveValue } from "@/components/ui/panelPrimitives";

interface DescendantColorsPanelProps {
  descendants: DescendantStyleInfo[];
  onStyleChange: (
    path: string,
    property: string,
    value: string,
    className: string | null,
    selector: string | null
  ) => void;
}

const COLOR_PROPERTIES = [
  { label: "Text", property: "color" },
  { label: "Background", property: "background-color" },
  { label: "Border", property: "border-color" },
] as const;

function getDescendantLabel(descendant: DescendantStyleInfo): string {
  const firstClass = descendant.classList.find(Boolean);
  if (descendant.id) return `${descendant.tagName}#${descendant.id}`;
  if (firstClass) return `${descendant.tagName}.${firstClass}`;
  return descendant.tagName;
}

export function DescendantColorsPanel({
  descendants,
  onStyleChange,
}: DescendantColorsPanelProps) {
  if (descendants.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-zinc-600">
        No descendants
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      {descendants.map((descendant) => (
        <div
          key={descendant.path}
          className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3"
          style={{ marginLeft: `${Math.max(0, descendant.depth - 1) * 10}px` }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold text-zinc-200">
                {getDescendantLabel(descendant)}
              </div>
              <div className="truncate text-[10px] text-zinc-500">
                {descendant.path}
              </div>
            </div>
            <div className="shrink-0 rounded-md bg-zinc-800/70 px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-400">
              L{descendant.depth}
            </div>
          </div>

          <div className="space-y-2.5">
            {COLOR_PROPERTIES.map(({ label, property }) => (
              <div key={property}>
                <label className="mb-1 block text-[10px] font-medium tracking-wide text-zinc-500">
                  {label}
                </label>
                <ColorInput
                  value={getEffectiveValue(descendant, property)}
                  computedValue={descendant.computed[property]}
                  onChange={(value) =>
                    onStyleChange(
                      descendant.path,
                      property,
                      value,
                      descendant.selectedClass,
                      descendant.selectedSelector
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
