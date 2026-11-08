/*
 * Secuencia de imágenes: carga progresiva por prioridad y dibujo en canvas.
 * No sabe nada de scroll: recibe un índice de frame y una posición de dibujo.
 */
(function () {
  'use strict';

  const STATUS = Object.freeze({ PENDING: 0, LOADING: 1, READY: 2, FAILED: 3 });

  function frameUrl(frames, index) {
    const number = String(frames.firstIndex + index).padStart(frames.pad, '0');
    return `${frames.basePath}${number}.${frames.extension}`;
  }

  /* Primero una pasada gruesa por toda la secuencia y luego se rellenan los huecos. */
  function coarseToFineOrder(count, baseStep) {
    const seen = new Set();
    const order = [];
    for (let step = 16 * baseStep; step >= baseStep; step = step / 2) {
      for (let i = 0; i < count; i += step) {
        if (!seen.has(i)) {
          seen.add(i);
          order.push(i);
        }
      }
    }
    const last = count - 1 - ((count - 1) % baseStep);
    return seen.has(last) ? order : [...order, last];
  }

  function createFrameStore(frames, loader, callbacks) {
    const count = frames.count;
    const images = new Array(count).fill(null);
    const status = new Array(count).fill(STATUS.PENDING);
    const saveData = Boolean(navigator.connection && navigator.connection.saveData);
    const baseStep = saveData ? loader.saveDataStep : 1;
    const order = coarseToFineOrder(count, baseStep);
    const wanted = order.length;
    let cursor = 0;
    let target = 0;
    let inFlight = 0;
    let ready = 0;
    let failed = 0;
    let fatal = false;

    function nextIndex() {
      const near = nearestPending();
      if (near !== -1) return near;
      while (cursor < order.length && status[order[cursor]] !== STATUS.PENDING) cursor += 1;
      return cursor < order.length ? order[cursor] : -1;
    }

    function nearestPending() {
      const aligned = target - (target % baseStep);
      for (let d = 0; d <= loader.nearbyWindow; d += baseStep) {
        const after = aligned + d;
        const before = aligned - d;
        if (after < count && status[after] === STATUS.PENDING) return after;
        if (before >= 0 && status[before] === STATUS.PENDING) return before;
      }
      return -1;
    }

    function settle(index, image) {
      inFlight -= 1;
      images[index] = image;
      status[index] = STATUS.READY;
      ready += 1;
      callbacks.onFrameReady(ready / wanted);
      pump();
    }

    function giveUp(index, url) {
      inFlight -= 1;
      status[index] = STATUS.FAILED;
      failed += 1;
      console.warn(`No se pudo cargar el frame ${url}`);
      const tooMany = failed / wanted > loader.maxFailRatio;
      const noneLoaded = ready === 0 && failed >= loader.maxInitialFails;
      if (tooMany || noneLoaded) {
        fatal = true;
        callbacks.onFatal();
        return;
      }
      callbacks.onFrameReady((ready + failed) / wanted);
      pump();
    }

    function load(index, url, retriesLeft) {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        image.decode().then(() => settle(index, image), () => giveUp(index, url));
      };
      image.onerror = () => {
        if (retriesLeft > 0 && !fatal) {
          setTimeout(() => load(index, url, retriesLeft - 1), loader.retryDelayMs);
        } else {
          giveUp(index, url);
        }
      };
      image.src = url;
    }

    function pump() {
      if (fatal || document.hidden) return;
      while (inFlight < loader.concurrency) {
        const index = nextIndex();
        if (index === -1) return;
        status[index] = STATUS.LOADING;
        inFlight += 1;
        load(index, frameUrl(frames, index), 1);
      }
    }

    function nearestReady(index) {
      for (let d = 0; d < count; d += 1) {
        if (index + d < count && status[index + d] === STATUS.READY) return index + d;
        if (index - d >= 0 && status[index - d] === STATUS.READY) return index - d;
      }
      return -1;
    }

    document.addEventListener('visibilitychange', pump);

    return Object.freeze({
      setTarget(index) {
        target = index;
        pump();
      },
      nearestReady,
      imageAt: (index) => images[index],
    });
  }

  function createRenderer(canvas, framingConfig, sourceSize) {
    const context = canvas.getContext('2d');
    const backdropCanvas = document.createElement('canvas');
    backdropCanvas.width = 16;
    backdropCanvas.height = 9;
    const backdropContext = backdropCanvas.getContext('2d');
    let viewport = { width: 0, height: 0 };

    function resize(width, height) {
      const dpr = Math.min(window.devicePixelRatio || 1, framingConfig.maxDpr);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      viewport = { width, height, dpr };
    }

    function maskEdge(x0, y0, x1, y1, startsInside, endsInside, feather) {
      const gradient = context.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, startsInside ? 'rgba(0,0,0,0)' : '#000');
      gradient.addColorStop(feather, '#000');
      gradient.addColorStop(1 - feather, '#000');
      gradient.addColorStop(1, endsInside ? 'rgba(0,0,0,0)' : '#000');
      context.fillStyle = gradient;
      context.fillRect(0, 0, viewport.width, viewport.height);
    }

    function applyEdgeMasks(rect) {
      const { feather } = framingConfig;
      const insideLeft = rect.x > 0;
      const insideRight = rect.x + rect.width < viewport.width;
      const insideTop = rect.y > 0;
      const insideBottom = rect.y + rect.height < viewport.height;
      context.globalCompositeOperation = 'destination-in';
      if (insideLeft || insideRight) {
        maskEdge(rect.x, 0, rect.x + rect.width, 0, insideLeft, insideRight, feather);
      }
      if (insideTop || insideBottom) {
        maskEdge(0, rect.y, 0, rect.y + rect.height, insideTop, insideBottom, feather);
      }
      return insideLeft || insideRight || insideTop || insideBottom;
    }

    function drawBackdrop(image) {
      const { backdrop } = framingConfig;
      backdropContext.globalCompositeOperation = 'source-over';
      backdropContext.drawImage(
        image,
        backdrop.x * sourceSize.width,
        backdrop.y * sourceSize.height,
        backdrop.width * sourceSize.width,
        backdrop.height * sourceSize.height,
        0, 0, backdropCanvas.width, backdropCanvas.height,
      );
      backdropContext.fillStyle = `rgba(10, 8, 7, ${backdrop.dim})`;
      backdropContext.fillRect(0, 0, backdropCanvas.width, backdropCanvas.height);
      context.globalCompositeOperation = 'destination-over';
      context.imageSmoothingQuality = 'high';
      context.drawImage(backdropCanvas, 0, 0, viewport.width, viewport.height);
    }

    function draw(image, rect) {
      context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      context.globalCompositeOperation = 'source-over';
      context.clearRect(0, 0, viewport.width, viewport.height);
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      if (applyEdgeMasks(rect)) drawBackdrop(image);
    }

    return Object.freeze({ resize, draw });
  }

  window.CafeSecuencia = Object.freeze({ createFrameStore, createRenderer });
})();
