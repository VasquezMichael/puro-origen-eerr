export type Branch = { id: string; name: string; active: boolean };
export type BranchAccess = { branchId: string; role: 'EDITOR' | 'READER' };
export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  active: boolean;
  mustChangePassword: boolean;
  branchAccesses: BranchAccess[];
};
export type AccessChoice = 'NONE' | BranchAccess['role'];

export function filterUsers(users: ManagedUser[], search: string) {
  const term = search.trim().toLocaleLowerCase('es');
  return term
    ? users.filter((user) => `${user.name} ${user.email}`.toLocaleLowerCase('es').includes(term))
    : users;
}

export function selectedAccesses(branches: Branch[], choices: Record<string, AccessChoice>): BranchAccess[] {
  return branches.flatMap((branch) => {
    const role = choices[branch.id];
    return role === 'EDITOR' || role === 'READER' ? [{ branchId: branch.id, role }] : [];
  });
}

export function userError(status: number, code: string | undefined, operation: 'create' | 'access' | 'status' | 'reset' | 'list') {
  if (status === 400) return 'Revisá los datos ingresados e intentá nuevamente.';
  if (status === 401) return 'Tu sesión venció. Volvé a ingresar.';
  if (status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') return 'Debés cambiar tu contraseña antes de administrar usuarios.';
  if (status === 403) return 'No tenés permiso para administrar usuarios.';
  if (status === 404) return 'El usuario o la sucursal ya no está disponible. Actualizá la lista.';
  if (status === 409 && code === 'USER_SELF_DEACTIVATION_NOT_ALLOWED') return 'No podés desactivar tu propia cuenta.';
  if (status === 409 && code === 'LAST_ACTIVE_ADMIN') return 'No se puede desactivar al último administrador activo.';
  if (status === 409 && (code === 'EMAIL_ALREADY_EXISTS' || operation === 'create')) return 'Ya existe un usuario con ese email.';
  if (status === 409) return 'Los datos cambiaron. Actualizá la lista e intentá nuevamente.';
  return 'No pudimos completar la operación. Intentá nuevamente.';
}
