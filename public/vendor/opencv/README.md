# Vendoring OpenCV.js (optional)

The Rig Studio's **Smart cut** button uses `cv.grabCut` to find a limb's real edge
inside a loose bounding box. OpenCV.js is ~9 MB of WebAssembly, so it is never
bundled and never precached — `src/rigStudio/opencvLoader.js` injects it on demand,
and `vite.config.js` excludes this directory from the service worker.

The loader tries this local copy first, then falls back to
`https://docs.opencv.org/4.10.0/opencv.js`. Drop the file here if you are offline or
behind a proxy that blocks that host:

```sh
curl -L -o public/vendor/opencv/opencv.js https://docs.opencv.org/4.10.0/opencv.js
```

`opencv.js` is gitignored — it is a build input, not source.

## It is an assist, not the path

The manual polygon lasso is the primary cutting tool and works with OpenCV absent.
Keep it that way. GrabCut separates foreground from background using colour
statistics, so it does well on frescoes, where robes are saturated against masonry,
and poorly on marble sculpture, where foreground and background share a palette.
A bust will usually be faster to trace by hand.

> Smart cut has **not** been verified end to end in this repo's CI sandbox, whose
> proxy returns 403 for `docs.opencv.org`. The loader's failure path is tested and
> degrades to a message pointing at the lasso; the mask quality itself is unverified.
