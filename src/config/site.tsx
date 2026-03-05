import { type LucideIcon, Image, LayoutGrid, Route, UserSquare2, Users } from "lucide-react";

export type SiteConfig = typeof siteConfig;

export type AdminNavigation = {
  icon: LucideIcon;
  name: string;
  href: string;
};

export const siteConfig = {
  title: "SteelArt 관리자",
  description: "SteelArt 모바일 콘텐츠 백오피스",
};

export const adminNavigations: AdminNavigation[] = [
  {
    icon: Users,
    name: "사용자",
    href: "/admin/users",
  },
  {
    icon: UserSquare2,
    name: "작가",
    href: "/admin/artists",
  },
  {
    icon: Image,
    name: "작품",
    href: "/admin/artworks",
  },
  {
    icon: Route,
    name: "코스",
    href: "/admin/courses",
  },
  {
    icon: LayoutGrid,
    name: "홈 배너",
    href: "/admin/home-banners",
  },
];
