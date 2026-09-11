export function cleanBranchName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function normalizeBranchName(value: string) {
  return cleanBranchName(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
