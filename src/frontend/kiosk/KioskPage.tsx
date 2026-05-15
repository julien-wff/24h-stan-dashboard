import { useEffect } from "react";
import { validateLayout, WidgetHost } from "./widgets/host";
import { defaultLayout } from "./widgets/layouts/default";
import { connect } from "./ws-client";

validateLayout(defaultLayout);

export function KioskPage() {
  useEffect(() => {
    const dispose = connect();
    return dispose;
  }, []);

  return <WidgetHost layout={defaultLayout} />;
}
