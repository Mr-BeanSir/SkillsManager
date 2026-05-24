import {
  Archive,
  Books,
  Compass,
  FolderSimpleDashed,
  GearSix,
  Icon,
  Stack
} from "@phosphor-icons/react";

export type PageId = "skills" | "discover" | "projects" | "groups" | "collections" | "settings";

export type NavItem = {
  id: PageId;
  labelKey: string;
  descriptionKey: string;
  icon: Icon;
};

export const appNavItems: NavItem[] = [
  {
    id: "projects",
    labelKey: "nav.projects.label",
    descriptionKey: "nav.projects.description",
    icon: FolderSimpleDashed
  },
  {
    id: "skills",
    labelKey: "nav.skills.label",
    descriptionKey: "nav.skills.description",
    icon: Archive
  },
  {
    id: "discover",
    labelKey: "nav.discover.label",
    descriptionKey: "nav.discover.description",
    icon: Compass
  },
  {
    id: "groups",
    labelKey: "nav.groups.label",
    descriptionKey: "nav.groups.description",
    icon: Stack
  },
  {
    id: "collections",
    labelKey: "nav.collections.label",
    descriptionKey: "nav.collections.description",
    icon: Books
  },
  {
    id: "settings",
    labelKey: "nav.settings.label",
    descriptionKey: "nav.settings.description",
    icon: GearSix
  }
];
