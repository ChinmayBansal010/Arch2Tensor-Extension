# Arch2Tensor Chrome Extension 🚀

Arch2Tensor is an AI-powered developer tool that automatically highlights and explains software architectures, models, and ML patterns directly on any webpage you visit.

## ✨ Features
* **Real-time HUD:** Tracks architecture mentions on the current page.
* **Interactive Tooltips:** Hover over highlighted terms to see metrics, code snippets, and mathematical formulas.
* **Flow Visualizer:** Automatically generates block diagrams of model architectures.
* **Compare Mode:** Select up to 3 architectures to compare side-by-side.
* **Colab Integration:** One-click copy or open code snippets directly in Google Colab.

## 🛠️ How to Install (Developer Mode)
Since this extension is distributed via GitHub, you can install it locally in less than a minute:

1. Download the latest release from the [Releases page](../../releases) (or clone this repository).
2. If you downloaded a `.zip` file, extract it to a folder on your computer.
3. Open Google Chrome and type `chrome://extensions/` in the address bar.
4. Turn on the **Developer mode** toggle in the top right corner.
5. Click the **Load unpacked** button in the top left.
6. Select the `Arch2Tensor-Extension` folder you downloaded.
7. The extension is now installed! Pin it to your browser toolbar to get started.

## 💻 Tech Stack
* **Frontend:** Vanilla JavaScript, HTML, CSS (Chrome Extension Manifest V3)
* **Backend:** FastAPI, Python, PostgreSQL (Neon)