import type { ReactNode } from "react";

export function Message({ children }: { children: ReactNode }) {
  return (
    <div className="message" role="status">
      {children}
    </div>
  );
}
