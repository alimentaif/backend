import { DateTime } from "luxon";

const TZ = "America/Sao_Paulo";

/**
 * Manhã: antes de 12:30; tarde: a partir de 12:30 (horário de São Paulo).
 */
export function getCurrentTurnFromDateTime(dt) {
  const h = dt.hour;
  const m = dt.minute;
  if (h < 12 || (h === 12 && m < 30)) return "manha";
  return "tarde";
}

/** Agora em São Paulo como Luxon DateTime */
export function nowSaoPaulo() {
  return DateTime.now().setZone(TZ);
}

/** Retorna 'manha' | 'tarde' conforme horário atual em America/Sao_Paulo */
export function getCurrentTurn() {
  return getCurrentTurnFromDateTime(nowSaoPaulo());
}

/** 0 = domingo … 6 = sábado (JS); mapeia para chave do schedule da turma */
export function weekdayKeyFromLuxon(dt) {
  const w = dt.weekday; // Luxon: 1 = segunda … 7 = domingo
  const map = { 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 7: "sun" };
  return map[w] ?? null;
}

/** Verifica se a turma permite o turno no dia atual (seg–sex) */
export function turmaAllowsTurnOnDate(turma, turno, dtSaoPaulo = nowSaoPaulo()) {
  const key = weekdayKeyFromLuxon(dtSaoPaulo);
  if (!key || !["mon", "tue", "wed", "thu", "fri"].includes(key)) {
    return { allowed: false, reason: "Fora do período letivo (fim de semana)." };
  }
  const slot = turma.schedule?.[key];
  if (!slot) {
    return { allowed: false, reason: "Horário não configurado para este dia." };
  }
  if (turno === "manha" && !slot.manha) {
    return { allowed: false, reason: "Turma sem retirada no turno da manhã neste dia." };
  }
  if (turno === "tarde" && !slot.tarde) {
    return { allowed: false, reason: "Turma sem retirada no turno da tarde neste dia." };
  }
  return { allowed: true, weekdayKey: key };
}
