export const DEFAULT_APP_WINDOW_WIDTH = 1180;

export type SkillDetailLayoutMode = "merged" | "separate-cards";

export function resolveSkillDetailLayout(width: number): SkillDetailLayoutMode {
  return width < DEFAULT_APP_WINDOW_WIDTH ? "separate-cards" : "merged";
}
