import { tokens } from "../../../shared/tokens";
/** Common tokens drive both native styles and Web variables; CSS has first-paint fallbacks. */
export function applyDesignTokens(root: HTMLElement) {
  const variables = {
    navy: tokens.colors.navy,
    green: tokens.colors.green,
    action: tokens.colors.action,
    ink: tokens.colors.text,
    muted: tokens.colors.muted,
    border: tokens.colors.border,
    bg: tokens.colors.background,
    danger: tokens.colors.danger,
    radius: `${tokens.radius.md}px`,
    fast: `${tokens.motion.fast}ms`,
    normal: `${tokens.motion.normal}ms`,
  };
  for (const [name, value] of Object.entries(variables))
    root.style.setProperty(`--ds-${name}`, value);
}
