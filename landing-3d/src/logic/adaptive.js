/*
 * Baja la resolucion si el tiempo de fotograma es malo. Solo baja: subir y bajar a la vez produce
 * saltos visibles. Sin DOM. Devuelve un estado nuevo en cada llamada.
 */
export const initialDprState = (initialDpr) => Object.freeze({ dpr: initialDpr, samples: Object.freeze([]), settle: 0 });

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function nextDprState(state, frameMs, { min, step, slowFrameMs, sampleSize, settleFrames }) {
  if (state.settle > 0) return Object.freeze({ ...state, settle: state.settle - 1 });
  if (state.dpr <= min) return state;
  const samples = [...state.samples, frameMs];
  if (samples.length < sampleSize) return Object.freeze({ ...state, samples: Object.freeze(samples) });
  const dpr = median(samples) > slowFrameMs ? Math.max(min, state.dpr - step) : state.dpr;
  return Object.freeze({ dpr, samples: Object.freeze([]), settle: dpr === state.dpr ? 0 : settleFrames });
}
