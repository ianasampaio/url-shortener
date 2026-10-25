// Sinaliza para a tela de login que a pessoa foi deslogada por um 401 no meio do uso,
// e não porque saiu por conta própria. É lido uma vez.
let expired = false

export function markSessionExpired(): void {
  expired = true
}

export function consumeSessionExpired(): boolean {
  const value = expired
  expired = false
  return value
}
