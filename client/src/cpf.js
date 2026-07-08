export function cleanCpf(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

export function formatCpf(value) {
  const cpf = cleanCpf(value);
  if (cpf.length <= 3) return cpf;
  if (cpf.length <= 6) return `${cpf.slice(0, 3)}.${cpf.slice(3)}`;
  if (cpf.length <= 9) return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6)}`;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export function isValidCpf(value) {
  const cpf = cleanCpf(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const digits = cpf.split('').map(Number);
  for (const position of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < position; i++) sum += digits[i] * (position + 1 - i);
    if (((sum * 10) % 11) % 10 !== digits[position]) return false;
  }
  return true;
}
