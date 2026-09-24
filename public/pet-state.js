const HOUR = 3600000;
const clamp = (n) => Math.max(0, Math.min(100, n));
export const petDay = (now) =>
  new Date(now + 8 * HOUR).toISOString().slice(0, 10);
export function restorePet(saved, now) {
  if (
    !saved ||
    saved.version !== 1 ||
    ![saved.mood, saved.activity, saved.updatedAt].every(Number.isFinite) ||
    saved.updatedAt > now + 60000
  )
    return { version: 1, mood: 75, activity: 70, updatedAt: now, fedDay: "" };
  return advancePet(
    {
      version: 1,
      mood: clamp(saved.mood),
      activity: clamp(saved.activity),
      updatedAt: saved.updatedAt,
      fedDay: typeof saved.fedDay === "string" ? saved.fedDay : "",
    },
    now,
  );
}
export function advancePet(state, now) {
  const elapsed = Math.max(0, now - state.updatedAt) / HOUR;
  return {
    ...state,
    mood: clamp(state.mood - elapsed * 4),
    activity: clamp(state.activity - elapsed * 8),
    updatedAt: Math.max(state.updatedAt, now),
  };
}
export function petAction(state, action, now, distance = 0) {
  const next = advancePet(state, now);
  if (action === "pet") next.mood = clamp(next.mood + 6);
  if (action === "play")
    next.activity = clamp(
      next.activity + Math.max(0, Math.min(distance, 30)) * 0.025,
    );
  if (action === "feed" && next.fedDay !== petDay(now)) {
    next.fedDay = petDay(now);
    next.mood = clamp(next.mood + 5);
  }
  return next;
}
