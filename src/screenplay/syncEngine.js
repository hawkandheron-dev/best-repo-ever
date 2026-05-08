const BASE_MS_PER_PAGE = 60_000;

export function pageDurationMs(pageIndex, pageData) {
  const page = pageData[pageIndex];
  if (!page) return BASE_MS_PER_PAGE;
  return BASE_MS_PER_PAGE * page.densityScore;
}

export function totalDurationMs(pageData) {
  return pageData.reduce((sum, _, i) => sum + pageDurationMs(i, pageData), 0);
}

// Returns a new sorted markers array, deduplicating within ±5s of the new entry.
export function addMarker(markers, elapsedMs, pageNum, subPageFraction) {
  const filtered = markers.filter(m => Math.abs(m.elapsedMs - elapsedMs) > 5_000);
  const next = [...filtered, { elapsedMs, pageNum, subPageFraction }];
  next.sort((a, b) => a.elapsedMs - b.elapsedMs);
  return next;
}

// Compute {pageNum, lineIndex} for a given elapsed time.
// markers is the user's correction array (may be empty).
// pageData is [{densityScore, lineCount}, ...] indexed 0-based.
export function computePosition(elapsedMs, pageData, markers) {
  if (!pageData.length) return { pageNum: 1, lineIndex: 0 };

  // Prepend a synthetic origin marker so we never have a "before first marker" case.
  const allMarkers = [{ elapsedMs: 0, pageNum: 1, subPageFraction: 0 }, ...markers];

  // Find bracketing segment: largest marker index where elapsedMs >= marker.elapsedMs.
  let segStart = allMarkers[0];
  let segEnd = null;
  for (let i = 1; i < allMarkers.length; i++) {
    if (allMarkers[i].elapsedMs <= elapsedMs) {
      segStart = allMarkers[i];
    } else {
      segEnd = allMarkers[i];
      break;
    }
  }

  const segElapsed = elapsedMs - segStart.elapsedMs;

  if (segEnd) {
    // Interpolate between segStart and segEnd.
    const segDuration = segEnd.elapsedMs - segStart.elapsedMs;
    const fraction = Math.max(0, Math.min(1, segElapsed / segDuration));

    const startPage = segStart.pageNum - 1; // 0-based
    const endPage = segEnd.pageNum - 1;

    // Calculate total weighted duration across the page range for density-adjusted interpolation.
    let totalWeight = 0;
    for (let p = startPage; p <= Math.min(endPage, pageData.length - 1); p++) {
      totalWeight += pageDurationMs(p, pageData);
    }
    if (totalWeight === 0) totalWeight = 1;

    // Walk pages until we consume `fraction` of the total weight.
    const targetWeight = fraction * totalWeight;
    let accumulated = 0;
    for (let p = startPage; p <= Math.min(endPage, pageData.length - 1); p++) {
      const pageMs = pageDurationMs(p, pageData);
      if (accumulated + pageMs >= targetWeight || p === pageData.length - 1) {
        const withinPage = (targetWeight - accumulated) / pageMs;
        const lineCount = pageData[p]?.lineCount || 55;
        const lineIndex = Math.floor(Math.max(0, Math.min(withinPage, 1)) * lineCount);
        return { pageNum: p + 1, lineIndex };
      }
      accumulated += pageMs;
    }

    // Fallback: end of range
    return { pageNum: segEnd.pageNum, lineIndex: 0 };
  } else {
    // Past the last marker — extrapolate using density-weighted timing.
    let remaining = segElapsed;
    let p = (segStart.pageNum - 1); // 0-based

    // Account for sub-page fraction at the start marker.
    const startLineCount = pageData[p]?.lineCount || 55;
    const startPageMs = pageDurationMs(p, pageData);
    const alreadyConsumedMs = segStart.subPageFraction * startPageMs;
    remaining -= (startPageMs - alreadyConsumedMs);

    if (remaining <= 0) {
      const withinPage = segStart.subPageFraction + (-remaining / startPageMs);
      const lineIndex = Math.floor(Math.min(withinPage, 0.999) * startLineCount);
      return { pageNum: p + 1, lineIndex };
    }

    p++;
    while (p < pageData.length - 1) {
      const pageMs = pageDurationMs(p, pageData);
      if (remaining <= pageMs) {
        const withinPage = remaining / pageMs;
        const lineCount = pageData[p]?.lineCount || 55;
        const lineIndex = Math.floor(Math.min(withinPage, 0.999) * lineCount);
        return { pageNum: p + 1, lineIndex };
      }
      remaining -= pageMs;
      p++;
    }

    // Past the end of the screenplay.
    const lastPage = pageData.length;
    return { pageNum: lastPage, lineIndex: 0 };
  }
}

// Format elapsed ms as M:SS
export function formatElapsed(ms) {
  if (ms < 0) ms = 0;
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
