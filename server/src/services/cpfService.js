export function cleanCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Validates a Brazilian CPF using the official check-digit algorithm. */
export function isValidCpf(value) {
  const cpf = cleanCpf(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split('').map(Number);
  for (const position of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < position; i++) {
      sum += digits[i] * (position + 1 - i);
    }
    const check = ((sum * 10) % 11) % 10;
    if (check !== digits[position]) return false;
  }
  return true;
}

export function formatCpf(value) {
  const cpf = cleanCpf(value);
  if (cpf.length !== 11) return value || '';
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}
