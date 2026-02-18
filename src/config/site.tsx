import { type LucideIcon, Image, LayoutGrid, Route, UserSquare2, Users } from "lucide-react";

export type SiteConfig = typeof siteConfig;

export type AdminNavigation = {
  icon: LucideIcon;
  name: string;
  href: string;
};

export const siteConfig = {
  title: "SteelArt Admin",
  description: "SteelArt mobile content backoffice",
};

export const adminNavigations: AdminNavigation[] = [
  {
    icon: Users,
    name: "Users",
    href: "/admin/users",
  },
  {
    icon: UserSquare2,
    name: "Artists",
    href: "/admin/artists",
  },
  {
    icon: Image,
    name: "Artworks",
    href: "/admin/artworks",
  },
  {
    icon: Route,
    name: "Courses",
    href: "/admin/courses",
  },
  {
    icon: LayoutGrid,
    name: "Home Banners",
    href: "/admin/home-banners",
  },
];
