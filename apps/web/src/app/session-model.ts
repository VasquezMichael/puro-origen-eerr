export type SessionUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  branchAccesses: { branchId: string; role: "READER" | "EDITOR" }[];
  mustChangePassword: boolean;
};
export function roleLabel(
  user: Pick<SessionUser, "isAdmin" | "branchAccesses">,
) {
  if (user.isAdmin) return "Administrador";
  const roles = new Set(user.branchAccesses.map((access) => access.role));
  if (roles.has("EDITOR") && roles.has("READER"))
    return "Editor / Lector según sucursal";
  if (roles.has("EDITOR")) return "Editor";
  return roles.has("READER") ? "Lector" : "Sin sucursales asignadas";
}
export type Section = "dashboard" | "eerr" | "branches";
export function navigationItems(isAdmin: boolean) {
  return [
    { section: "dashboard", href: "/", label: "Dashboard" },
    { section: "eerr", href: "/eerr", label: "Estados de resultados" },
    ...(isAdmin
      ? [
          {
            section: "branches",
            href: "/admin/sucursales",
            label: "Sucursales",
          },
        ]
      : []),
  ];
}
