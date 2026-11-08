/* El scroll nativo es la unica fuente de verdad: scrollY -> progreso -> segundos. Sin estado. */
import { DURATION } from './timeline.js';

export const progressAt = (scrollY, { top, range }) => Math.min(1, Math.max(0, (scrollY - top) / range));
export const timeForProgress = (progress) => progress * DURATION;
export const scrollForTime = (time, { top, range }) => top + (time / DURATION) * range;
