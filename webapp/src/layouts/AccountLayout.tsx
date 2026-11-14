import type { PropsWithChildren } from "react";
import { Brand } from "../components/Brand";
/** Shared authentication/account frame; the individual page owns its form and access guard. */
export function AccountLayout({ children }: PropsWithChildren) {
  return (
    <main className="entry-page">
      <Brand />
      {children}
    </main>
  );
}
