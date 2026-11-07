# Preview streamer regression checks

Run `node test/preview-streamer.js` from the repository root. No npm packages,
FFmpeg process, or NDI device are required. The test executes the shipped
`dist/PreviewStreamer.js` with a recording FFmpeg stub and checks audio-only,
video-only, and mixed-transport output selection, plus repeated `spawn()` calls.

These are configuration-level checks, not end-to-end streaming tests.
