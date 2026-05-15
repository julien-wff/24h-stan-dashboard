import type React from "react";
import { widgetsById } from "./registry";
import type { Layout } from "./types";

export function validateLayout(layout: Layout): void {
  const areaTokens = new Set<string>();
  for (const row of layout.grid.areas) {
    for (const token of row.split(/\s+/)) {
      if (token && token !== ".") {
        areaTokens.add(token);
      }
    }
  }

  for (const token of areaTokens) {
    if (!(token in layout.slots)) {
      throw new Error(`Layout area "${token}" has no corresponding slot`);
    }
  }

  for (const slot of Object.keys(layout.slots)) {
    if (!areaTokens.has(slot)) {
      throw new Error(`Slot "${slot}" is not referenced in any grid area`);
    }
    const widgetId = layout.slots[slot];
    if (widgetId === undefined || !(widgetId in widgetsById)) {
      throw new Error(`Slot "${slot}" references unknown widget id "${widgetId}"`);
    }
  }

  if (!(layout.topbar in widgetsById)) {
    throw new Error(`Topbar widget id "${layout.topbar}" not found in registry`);
  }
}

export function Panel({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-[18px] py-3">
        <div className="text-sm font-bold tracking-[3px] text-text-dim">{title}</div>
        {right !== undefined && <div className="text-sm font-bold tracking-[2px]">{right}</div>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-[14px_18px]">{children}</div>
    </div>
  );
}

export function WidgetSlot({ id }: { id: string }) {
  const widget = widgetsById[id];
  if (!widget) {
    return (
      <div className="h-full w-full min-h-0 min-w-0 flex items-center justify-center text-text-dim">
        {id}
      </div>
    );
  }
  return (
    <div className="h-full w-full min-h-0 min-w-0">
      <widget.Component />
    </div>
  );
}

export function WidgetHost({ layout }: { layout: Layout }) {
  return (
    <div className="grid h-screen w-screen grid-rows-[128px_1fr] bg-bg font-display text-text">
      <WidgetSlot id={layout.topbar} />
      <div
        className="grid min-h-0 min-w-0 overflow-hidden"
        style={{
          gridTemplateColumns: layout.grid.columns,
          gridTemplateRows: layout.grid.rows,
          gridTemplateAreas: layout.grid.areas.map((r) => `'${r}'`).join(" "),
          gap: layout.grid.gap,
          padding: layout.grid.padding,
        }}
      >
        {Object.entries(layout.slots).map(([area, id]) => (
          <div key={area} className="min-h-0 min-w-0" style={{ gridArea: area }}>
            <WidgetSlot id={id} />
          </div>
        ))}
      </div>
    </div>
  );
}
