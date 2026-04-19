# Magic Lens Multimodal — VS Code Environment & Architecture Guide

This guide provides a comprehensive technical overview of the Magic Lens Multimodal demo environment. It explains the project architecture, file structure, key technical decisions, and provides step-by-step instructions for reproducing the successful state in Visual Studio Code.

## 1. Project Architecture & File Structure

The project is designed to be a lightweight, serverless (or minimal-server) frontend application that simulates a complex neurosymbolic compliance pipeline.

### Core Files

| File | Purpose | Technical Details |
|---|---|---|
| `magic_lens_multimodal.html` | The main application entry point | Contains the entire UI, CSS styling, and frontend logic. It includes the DOM structure for the Magic Lens interface, the Evidence Lens panel, and the VideoTRACE modal. |
| `compliance_video.mp4` | The pre-rendered compliance video | A 21.5-second, 1080p video with an ElevenLabs voiceover. It simulates the output of the SEedance 2.0 text-to-video model. |
| `seedance-proxy.js` | Local CORS proxy (optional) | A Node.js proxy server used when connecting to the live BytePlus/ModelArk API to bypass browser CORS restrictions. |
| `start-demo.sh` | Convenience launcher | A bash script that starts both the HTTP server and the proxy server simultaneously. |
| `VideoGenerateModal_ideation.md` | UI specification | The markdown spec for the VideoTRACE modal content (narrative plan, scenes, evidence sources). |

### Supporting Assets (Generated Scenes)
- `scene1.png`: Nuclear control room with 10 CFR 50 App. B violation overlay.
- `scene2.png`: NRC Inspection Report 2024 document interface.
- `scene3.png`: Safety analysis dashboard showing deviation graphs.
- `scene4.png`: Engineering review action checklist.

## 2. Step-by-Step: Setting Up in Visual Studio Code

To replicate the exact successful state in your local VS Code environment, follow these steps:

### Step 1: Clone the Repository
1. Open VS Code.
2. Open the terminal (`Ctrl + \`` or `Cmd + \``).
3. Clone the repository:
   ```bash
   git clone https://github.com/stephaniej888/MagicLensMultimodal.git
   cd MagicLensMultimodal
   ```

### Step 2: Serve the Files Locally
The application *must* be served via a local HTTP server, not opened directly via `file://`. This is because the video file (`compliance_video.mp4`) needs to be fetched correctly, and modern browsers block certain features (like module scripts or fetch requests) on `file://` URLs.

**Option A: Using VS Code Live Server (Recommended)**
1. Install the **Live Server** extension in VS Code (by Ritwick Dey).
2. Right-click on `magic_lens_multimodal.html` in the file explorer.
3. Select **"Open with Live Server"**.
4. The demo will open in your default browser (usually at `http://127.0.0.1:5500/magic_lens_multimodal.html`).

**Option B: Using Python's Built-in Server**
1. In the VS Code terminal, run:
   ```bash
   python3 -m http.server 8765
   ```
2. Open your browser and navigate to: `http://localhost:8765/magic_lens_multimodal.html`

### Step 3: Running the Demo
1. Once the page loads, scroll down to the **Approved Lab Evidence** section.
2. Click the **"🎬 Generate Video Explanation"** button.
3. The VideoTRACE modal will open.
4. Click **"🎬 Generate Video Brief →"**.
5. Watch the pipeline simulate the generation process (`queued → running → succeeded`).
6. The `compliance_video.mp4` will play inline with the voiceover.

## 3. Technical Engineering Review: What Was Fixed

During the development of this demo, several critical issues were identified and resolved to create a stable, reliable environment.

### Issue 1: The Broken "Generate Video Explanation" Button
**The Problem:** The button lived inside a dynamically injected DOM panel. The original code attached a click listener to it once. However, when the panel was re-rendered, the button became a brand new DOM element, losing its event listener. A `dataset.bound` check prevented the listener from being re-attached.
**The Fix:** Implemented **document-level event delegation** using the capture phase. A single, permanent listener was attached to `document.body` that intercepts all clicks on `#generate-video-btn`, regardless of when the element was created or how many times it was re-rendered. It also auto-clicks the generate button inside the modal to streamline the demo flow.

### Issue 2: The Video Loading Failure (Base64 vs. Separate File)
**The Problem:** Initially, to avoid needing a local server, the 2.3 MB video was embedded directly into the HTML as a base64 data URI inside a JavaScript string. This resulted in a 3-million-character string literal, which caused the browser's JavaScript engine to throw a `SyntaxError: missing ) after argument list`. This fatal parse error killed all scripts on the page, breaking every button.
**The Fix:** Reverted the base64 approach. The video is now served as a separate file (`compliance_video.mp4`) alongside the HTML. This requires a local HTTP server (like Live Server or Python's `http.server`), but it guarantees that the HTML parses instantly and all JavaScript functions execute correctly.

### Issue 3: The "Video runtime still loading" Error
**The Problem:** The `getVideoBridge` function was waiting for `window.MagicLensVideo` to be defined, but it was never being registered, causing a timeout and the persistent loading error.
**The Fix:** Updated `getVideoBridge` to immediately register the `window.MagicLensVideo` object and the `generateFromScenario` function, ensuring the bridge resolves instantly.

### Issue 4: The Mock Video Pipeline
**The Problem:** The live SEedance API requires a valid, funded BytePlus ModelArk account. For a reliable, repeatable demo environment, relying on a live API call that might fail due to quota limits or network issues is risky.
**The Fix:** Implemented a `compileVideo` mock function. When triggered, it simulates the exact API polling sequence (`queued → running → running → succeeded`) over ~3.5 seconds, and then returns the local `compliance_video.mp4` URL. This provides a visually identical experience to the live API without the dependency.

### Issue 5: Local Video URL Validation
**The Problem:** The `isLikelyVideoUrl` function was performing a `HEAD` request to verify the content type. Local development servers often don't return the correct `video/mp4` MIME type, causing the validation to fail and the video to be blocked.
**The Fix:** Patched `isLikelyVideoUrl` to immediately accept and trust URLs ending in `.mp4` when served locally, bypassing the network check.

## 4. Switching Back to the Live SEedance API (Optional)

If you have a funded BytePlus account and want to connect the demo back to the live SEedance 2.0 API:

1. Open `magic_lens_multimodal.html`.
2. Locate the `compileVideo` function (around line 3888).
3. Remove the mock implementation and restore the `_realCompileVideo` logic.
4. Ensure the `seedance-proxy.js` server is running in a separate terminal:
   ```bash
   node seedance-proxy.js
   ```
5. The HTML will now route requests through `http://localhost:3001` to the live BytePlus endpoint (`ark.ap-southeast.bytepluses.com`).
