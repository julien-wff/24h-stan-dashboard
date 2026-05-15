import { Panel } from "./host";
import type { Widget } from "./types";

export function placeholder(id: string, title: string): Widget {
  function PlaceholderComponent() {
    return <Panel title={title}>{null}</Panel>;
  }
  PlaceholderComponent.displayName = `Placeholder(${id})`;
  return { id, Component: PlaceholderComponent };
}
