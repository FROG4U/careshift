"use client";

import { useEffect } from "react";

/** Opens the print dialog once the document has rendered. */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
