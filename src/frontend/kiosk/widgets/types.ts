import type React from "react";

export type Widget = {
  readonly id: string;
  readonly Component: React.ComponentType;
};

export type GridLayout = {
  readonly columns: string;
  readonly rows: string;
  readonly areas: readonly string[];
  readonly gap: number;
  readonly padding: number;
};

export type Layout = {
  readonly topbar: string;
  readonly grid: GridLayout;
  readonly slots: Readonly<Record<string, string>>;
};
