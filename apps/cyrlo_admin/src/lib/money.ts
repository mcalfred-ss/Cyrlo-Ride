/** Display helper — API money fields remain integer pesewas. */
export function formatGhsFromPesewas(amountPesewas: number): string {
  const cedis = amountPesewas / 100;
  return `GH₵${cedis.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
