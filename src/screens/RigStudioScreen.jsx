import { useCallback, useMemo, useRef, useState } from 'react';
import { createEmptyRig, NOMINAL_HEIGHT } from '../fighter/rig/rigSchema';
import { installStandardClips } from '../fighter/rig/standardClips';
import { buildParts, findMisalignedParts, initialAnchor } from '../rigStudio/derivePivots';
import { loadImageFile, bitmapToCanvas, extractPolygon, extractMask } from '../rigStudio/imageIO';
import { grabCutRect } from '../rigStudio/opencvLoader';
import { PART_TARGETS, PART_GROUPS, REQUIRED_PARTS } from '../rigStudio/partTargets';
import { serializeEmbedded, exportBundle, downloadBlob, loadRigDocument } from '../rigStudio/rigIO';
import { CutCanvas } from '../components/RigStudio/CutCanvas';
import { RigCanvas } from '../components/RigStudio/RigCanvas';
import { RigPreview } from '../components/RigStudio/RigPreview';
import styles from './RigStudioScreen.module.css';

const TABS = ['Source', 'Cut', 'Rig', 'Preview', 'Export'];

/**
 * Turn a painting into a rigged fighter.
 *
 * The flow is deliberately linear: load a source, cut the figure into the standard
 * part list, line the skeleton up with it, watch it move, export.  Authoring NEW
 * animation is not part of this — the standard moveset is already written, so for a
 * first character the job is cut, rig, verify.
 *
 * One thing worth knowing before reading the code: **pivots are derived, never set
 * by hand.** A part's pivot is wherever its bone's joint falls inside the piece
 * that was cut, so once the skeleton is positioned every pivot follows. Moving a
 * joint silently re-pivots every part bound to it, which is what makes rigging
 * feel like tracing rather than data entry.
 */
export function RigStudioScreen({ onBack }) {
  const [tab, setTab] = useState('Source');
  const [sourceCanvas, setSourceCanvas] = useState(null);
  const [sourceName, setSourceName] = useState('');
  const [error, setError] = useState('');

  const [provenance, setProvenance] = useState({
    title: '', artist: '', year: '', url: '', license: 'public-domain', note: '',
  });
  const [charId, setCharId] = useState('heraclitus');
  const [charName, setCharName] = useState('Heraclitus');

  // Cut state: one polygon and one extracted canvas per part id.
  const [polygons, setPolygons] = useState({});
  const [offsets, setOffsets] = useState({});
  const [images, setImages] = useState(() => new Map());
  const [activePartId, setActivePartId] = useState(PART_TARGETS[0].id);
  const [draft, setDraft] = useState([]);
  const [cutting, setCutting] = useState(false);

  // Where the skeleton sits on the source image.
  const [anchor, setAnchor] = useState({
    footX: 0, footY: 0, pxPerUnit: 1, viewX: 0, viewY: 0, viewScale: 1,
  });
  const [bones, setBones] = useState(null); // null → the default skeleton
  const [selectedBone, setSelectedBone] = useState('pelvis');
  const [showSource, setShowSource] = useState(true);
  const [showParts, setShowParts] = useState(true);

  const fileRef = useRef(null);
  const rigFileRef = useRef(null);

  /* ── The rig document, derived ──────────────────────────────────────────── */

  const baseRig = useMemo(() => {
    const rig = createEmptyRig(charId || 'untitled');
    rig.name = charName;
    rig.source = { ...provenance, year: provenance.year ? Number(provenance.year) : null };
    if (bones) rig.bones = bones;
    return rig;
  }, [charId, charName, provenance, bones]);

  // Pivots are derived, not authored — see `rigStudio/derivePivots.js`.
  const rig = useMemo(
    () => installStandardClips({
      ...baseRig,
      parts: buildParts(baseRig, PART_TARGETS, images, offsets, anchor),
    }),
    [baseRig, images, offsets, anchor],
  );

  const cutCount = Object.keys(polygons).length;
  const missingRequired = REQUIRED_PARTS.filter((id) => !images.has(id));

  /* ── Source ─────────────────────────────────────────────────────────────── */

  const onPickFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const bitmap = await loadImageFile(file);
      const canvas = bitmapToCanvas(bitmap);
      setSourceCanvas(canvas);
      setSourceName(file.name);
      // Start the skeleton standing on the bottom of the frame at ~80% of its height.
      setAnchor(initialAnchor(canvas.width, canvas.height, NOMINAL_HEIGHT));
      setTab('Cut');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  /* ── Cutting ────────────────────────────────────────────────────────────── */

  const addPoint = useCallback((p) => setDraft((d) => [...d, p]), []);
  const undoPoint = useCallback(() => setDraft((d) => d.slice(0, -1)), []);
  const clearDraft = useCallback(() => setDraft([]), []);

  /** Store a finished cut and move on to the next part still needing one. */
  const acceptCut = useCallback((cut, outline) => {
    setImages((prev) => new Map(prev).set(activePartId, cut.canvas));
    setOffsets((prev) => ({ ...prev, [activePartId]: cut.offset }));
    setPolygons((prev) => ({ ...prev, [activePartId]: outline }));
    setDraft([]);
    setError('');

    // Advance to the next part still needing a cut, so tracing flows without
    // reaching for the list between every piece.
    const order = PART_TARGETS.map((t) => t.id);
    const from = order.indexOf(activePartId);
    const next = order.slice(from + 1).find((id) => !polygons[id] && id !== activePartId);
    if (next) setActivePartId(next);
  }, [activePartId, polygons]);

  const commitPart = useCallback(() => {
    if (!sourceCanvas || draft.length < 3) return;
    const cut = extractPolygon(sourceCanvas, draft);
    if (!cut) {
      setError('That outline enclosed nothing');
      return;
    }
    acceptCut(cut, draft);
  }, [sourceCanvas, draft, acceptCut]);

  /**
   * Smart cut: take the outline's bounding box as a hint and let GrabCut find the
   * actual edge inside it, so a loose four-corner box becomes a traced limb.
   *
   * Strictly an assist. It downloads ~9 MB of wasm on first use and it is allowed to
   * fail — offline, blocked, or simply bad at marble-on-marble, where foreground and
   * background share a palette. The lasso stays the reliable path, so a failure here
   * reports and leaves the outline untouched rather than losing the user's work.
   */
  const smartCut = useCallback(async () => {
    if (!sourceCanvas || draft.length < 2) return;
    const xs = draft.map((p) => p.x);
    const ys = draft.map((p) => p.y);
    const rect = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
    if (rect.width < 8 || rect.height < 8) {
      setError('Draw a larger box before using smart cut');
      return;
    }

    setCutting(true);
    setError('');
    try {
      const mask = await grabCutRect(sourceCanvas, rect);
      const cut = extractMask(sourceCanvas, mask);
      if (!cut) {
        setError('Smart cut found no foreground there — trace it by hand instead');
        return;
      }
      acceptCut(cut, draft);
    } catch (err) {
      setError(`Smart cut unavailable (${err.message}). Trace the outline by hand — that always works.`);
    } finally {
      setCutting(false);
    }
  }, [sourceCanvas, draft, acceptCut]);

  const dropPart = useCallback((partId) => {
    setImages((prev) => {
      const next = new Map(prev);
      next.delete(partId);
      return next;
    });
    setPolygons((prev) => {
      const { [partId]: _drop, ...rest } = prev;
      return rest;
    });
    setOffsets((prev) => {
      const { [partId]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  const selectPart = useCallback((partId) => {
    setActivePartId(partId);
    setDraft([]);
  }, []);

  /* ── Rigging ────────────────────────────────────────────────────────────── */

  const moveBone = useCallback((boneId, pos) => {
    setBones((prev) => {
      const source = prev ?? baseRig.bones;
      return source.map((b) => (b.id === boneId ? { ...b, pos } : b));
    });
  }, [baseRig.bones]);

  const resetSkeleton = useCallback(() => setBones(null), []);

  const panView = useCallback((dx, dy) => {
    setAnchor((a) => ({ ...a, viewX: a.viewX + dx, viewY: a.viewY + dy }));
  }, []);

  const fitView = useCallback((next) => setAnchor((a) => ({ ...a, ...next })), []);

  const misaligned = useMemo(() => {
    const sizes = new Map();
    for (const [id, canvas] of images) sizes.set(id, { width: canvas.width, height: canvas.height });
    return findMisalignedParts(rig.parts, sizes);
  }, [rig.parts, images]);

  /* ── Export / import ────────────────────────────────────────────────────── */

  const exportEmbedded = useCallback(() => {
    const json = serializeEmbedded(rig, images);
    downloadBlob(new Blob([json], { type: 'application/json' }), `${rig.id}.rig.json`);
  }, [rig, images]);

  const onLoadRig = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const loaded = await loadRigDocument(text, { installClips: installStandardClips });
      setBones(loaded.rig.bones);
      setCharId(loaded.rig.id);
      setCharName(loaded.rig.name ?? '');
      if (loaded.rig.source) {
        setProvenance({
          title: loaded.rig.source.title ?? '', artist: loaded.rig.source.artist ?? '',
          year: loaded.rig.source.year ?? '', url: loaded.rig.source.url ?? '',
          license: loaded.rig.source.license ?? '', note: loaded.rig.source.note ?? '',
        });
      }
      setImages(loaded.images);
      setError(loaded.problems.length ? `Loaded with ${loaded.problems.length} problem(s): ${loaded.problems[0]}` : '');
      setTab('Preview');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>&larr; Menu</button>
        <h1 className={styles.title}>Rig Studio</h1>
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <span className={styles.status}>
          {cutCount}/{PART_TARGETS.length} cut
        </span>
      </div>

      {error && <div className={styles.error} onClick={() => setError('')}>{error}</div>}

      {tab === 'Source' && (
        <div className={styles.panelWide}>
          <div className={styles.formRow}>
            <button className={styles.primary} onClick={() => fileRef.current?.click()}>
              Load source image
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
            <button className={styles.secondary} onClick={() => rigFileRef.current?.click()}>
              Open .rig.json
            </button>
            <input ref={rigFileRef} type="file" accept=".json,application/json" hidden onChange={onLoadRig} />
            {sourceName && <span className={styles.hint}>{sourceName} — {sourceCanvas?.width}×{sourceCanvas?.height}</span>}
          </div>

          <p className={styles.blurb}>
            Use a public-domain photograph or scan: a detail from the School of Athens, a
            museum photograph of a bust, a 19th-century engraving. A figure whose arms and
            legs are separable and not badly foreshortened will rig far better than a
            dramatic pose — you are going to re-pose it anyway.
          </p>

          <div className={styles.fields}>
            <label className={styles.field}>
              <span>Character id</span>
              <input value={charId} onChange={(e) => setCharId(e.target.value)} placeholder="heraclitus" />
            </label>
            <label className={styles.field}>
              <span>Name</span>
              <input value={charName} onChange={(e) => setCharName(e.target.value)} placeholder="Heraclitus" />
            </label>
            <label className={styles.field}>
              <span>Artwork title</span>
              <input
                value={provenance.title}
                onChange={(e) => setProvenance((p) => ({ ...p, title: e.target.value }))}
                placeholder="The School of Athens (detail)"
              />
            </label>
            <label className={styles.field}>
              <span>Artist</span>
              <input
                value={provenance.artist}
                onChange={(e) => setProvenance((p) => ({ ...p, artist: e.target.value }))}
                placeholder="Raphael"
              />
            </label>
            <label className={styles.field}>
              <span>Year</span>
              <input
                value={provenance.year}
                onChange={(e) => setProvenance((p) => ({ ...p, year: e.target.value }))}
                placeholder="1511"
              />
            </label>
            <label className={styles.field}>
              <span>Licence</span>
              <input
                value={provenance.license}
                onChange={(e) => setProvenance((p) => ({ ...p, license: e.target.value }))}
              />
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span>Source URL</span>
              <input
                value={provenance.url}
                onChange={(e) => setProvenance((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://commons.wikimedia.org/..."
              />
            </label>
          </div>
          <p className={styles.blurb}>
            Provenance travels with the rig and is meant to be shown in game. Since every
            pixel of a finished fighter comes out of a real artwork, the credit is part of
            the asset, not paperwork.
          </p>
        </div>
      )}

      {tab === 'Cut' && (
        <div className={styles.split}>
          <aside className={styles.sidebar}>
            {PART_GROUPS.map((group) => (
              <div key={group} className={styles.group}>
                <span className={styles.groupLabel}>{group}</span>
                {PART_TARGETS.filter((t) => t.group === group).map((target) => (
                  <button
                    key={target.id}
                    className={`${styles.partBtn} ${target.id === activePartId ? styles.partActive : ''} ${images.has(target.id) ? styles.partDone : ''}`}
                    onClick={() => selectPart(target.id)}
                    title={target.hint ?? ''}
                  >
                    <span className={styles.partLabel}>{target.label}</span>
                    <span className={styles.partMark}>
                      {images.has(target.id) ? '●' : target.optional ? '○' : '·'}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          <div className={styles.stage}>
            <CutCanvas
              sourceCanvas={sourceCanvas}
              polygon={draft}
              committed={polygons}
              activePartId={activePartId}
              onAddPoint={addPoint}
            />
            <div className={styles.toolbar}>
              <span className={styles.cutting}>
                Cutting: <strong>{PART_TARGETS.find((t) => t.id === activePartId)?.label}</strong>
              </span>
              <button className={styles.primary} onClick={commitPart} disabled={draft.length < 3}>
                Commit ({draft.length})
              </button>
              <button
                className={styles.secondary}
                onClick={smartCut}
                disabled={draft.length < 2 || cutting}
                title="Use the outline's bounding box as a hint and let GrabCut find the real edge"
              >
                {cutting ? 'Cutting…' : 'Smart cut'}
              </button>
              <button className={styles.secondary} onClick={undoPoint} disabled={!draft.length}>
                Undo point
              </button>
              <button className={styles.secondary} onClick={clearDraft} disabled={!draft.length}>
                Clear
              </button>
              {images.has(activePartId) && (
                <button className={styles.danger} onClick={() => dropPart(activePartId)}>
                  Delete part
                </button>
              )}
            </div>
            <p className={styles.hint}>
              Tap to place points around the limb, drag to pan, pinch or scroll to zoom.
              Cut <em>past</em> each joint by a good margin — a rigid part that stops at the
              elbow opens a visible gap the moment the arm bends. <strong>Smart cut</strong> takes
              a loose box and finds the real edge inside it; it downloads a large library on first
              use, and tracing by hand always works.
            </p>
          </div>
        </div>
      )}

      {tab === 'Rig' && (
        <div className={styles.split}>
          <aside className={styles.sidebar}>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Figure placement</span>
              <label className={styles.slider}>
                <span>Height</span>
                <input
                  type="range" min={0.2} max={4} step={0.005}
                  value={anchor.pxPerUnit}
                  onChange={(e) => setAnchor((a) => ({ ...a, pxPerUnit: Number(e.target.value) }))}
                />
              </label>
              <label className={styles.slider}>
                <span>Feet ↔</span>
                <input
                  type="range" min={0} max={sourceCanvas?.width ?? 100} step={1}
                  value={anchor.footX}
                  onChange={(e) => setAnchor((a) => ({ ...a, footX: Number(e.target.value) }))}
                />
              </label>
              <label className={styles.slider}>
                <span>Feet ↕</span>
                <input
                  type="range" min={0} max={sourceCanvas?.height ?? 100} step={1}
                  value={anchor.footY}
                  onChange={(e) => setAnchor((a) => ({ ...a, footY: Number(e.target.value) }))}
                />
              </label>
              <label className={styles.slider}>
                <span>Zoom</span>
                <input
                  type="range" min={0.1} max={3} step={0.01}
                  value={anchor.viewScale}
                  onChange={(e) => setAnchor((a) => ({ ...a, viewScale: Number(e.target.value) }))}
                />
              </label>
            </div>

            <div className={styles.group}>
              <span className={styles.groupLabel}>Overlays</span>
              <button
                className={`${styles.partBtn} ${showSource ? styles.partActive : ''}`}
                onClick={() => setShowSource((v) => !v)}
              >
                <span className={styles.partLabel}>Source image</span>
              </button>
              <button
                className={`${styles.partBtn} ${showParts ? styles.partActive : ''}`}
                onClick={() => setShowParts((v) => !v)}
              >
                <span className={styles.partLabel}>Cut parts</span>
              </button>
              <button className={styles.partBtn} onClick={resetSkeleton}>
                <span className={styles.partLabel}>Reset skeleton</span>
              </button>
            </div>

            <div className={styles.group}>
              <span className={styles.groupLabel}>Selected</span>
              <span className={styles.hint}>{selectedBone}</span>
            </div>

            <div className={styles.group}>
              <span className={styles.groupLabel}>Alignment</span>
              {images.size === 0 ? (
                <span className={styles.hint}>Nothing cut yet.</span>
              ) : misaligned.length === 0 ? (
                <span className={styles.ok}>Every joint sits inside its part.</span>
              ) : (
                <span className={styles.warn}>
                  {misaligned.length} joint(s) fall outside their part — move the skeleton onto
                  the figure: {misaligned.join(', ')}
                </span>
              )}
            </div>
          </aside>

          <div className={styles.stage}>
            <RigCanvas
              rig={rig}
              images={images}
              sourceCanvas={sourceCanvas}
              anchor={anchor}
              selectedBone={selectedBone}
              onSelectBone={setSelectedBone}
              onMoveBone={moveBone}
              onPanView={panView}
              onFitView={fitView}
              showSource={showSource}
              showParts={showParts}
            />
            <p className={styles.hint}>
              Drag the blue joints onto the figure&apos;s real joints. Pivots follow
              automatically — every part bound to a joint re-pivots as you move it, so this
              is tracing, not data entry. Set the overall height and footing with the
              sliders first; the dashed line is the ground the fighter stands on.
            </p>
          </div>
        </div>
      )}

      {tab === 'Preview' && (
        <div className={styles.panelWide}>
          <RigPreview rig={rig} images={images} />
        </div>
      )}

      {tab === 'Export' && (
        <div className={styles.panelWide}>
          <div className={styles.formRow}>
            <button className={styles.primary} onClick={exportEmbedded} disabled={images.size === 0}>
              Export single .rig.json
            </button>
            <button className={styles.secondary} onClick={() => exportBundle(rig, images)} disabled={images.size === 0}>
              Export JSON + PNGs
            </button>
          </div>
          <p className={styles.blurb}>
            The single file inlines every part as a data URL — one thing to move around, and
            it opens straight back into this studio. The bundle writes loose PNGs you can
            repaint in any editor, and is what the game and the headless scripts read.
          </p>
          <p className={styles.blurb}>
            Neither export carries the animation clips: they are identical for every
            character and would bury the interesting part of the file. The rig is flagged
            <code> usesStandardClips</code> and they are reattached on load.
          </p>

          <div className={styles.summary}>
            <div><strong>{images.size}</strong> parts cut</div>
            <div><strong>{rig.bones.length}</strong> bones</div>
            <div><strong>{Object.keys(rig.clips).length}</strong> clips attached</div>
            {misaligned.length > 0 && (
              <div className={styles.warn}>
                {misaligned.length} part(s) pivot outside their own image. Line the skeleton
                up on the Rig tab before exporting, or limbs will rotate about thin air.
              </div>
            )}
            {missingRequired.length > 0 ? (
              <div className={styles.warn}>
                Still missing: {missingRequired.map((id) => PART_TARGETS.find((t) => t.id === id)?.label).join(', ')}
              </div>
            ) : (
              <div className={styles.ok}>All required parts are cut.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
