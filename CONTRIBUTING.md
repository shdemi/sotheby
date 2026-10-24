# Contributing to Sotheby's Mansion

Thank you for your interest in contributing to Sotheby's Mansion!
This document outlines best practices to make your Pull Requests easy to review and merge smoothly.

---

## Quick Start

1. Fork the repo and clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/sotheby.git
   cd sotheby
   ```
2. Start the local dev server:
   ```bash
   npm run serve
   # or: python -m http.server 8000
   ```
3. Open `http://localhost:8000` in your browser.

---

## Areas You Can Contribute

### 1. Translations (`locales/`)
- Adding support for a new language or updating existing strings.
- Please see [`locales/README.md`](./locales/README.md) for detailed guidelines.
- Recommendation: Use the **i18n Ally** extension in VS Code.

### 2. Game Data Updates (`data/`)
- Adding new characters, psychubes, or resonance patterns.
- We have an integrated editor tool located at `/editor/index.html`. Open it locally (`http://localhost:8000/editor/index.html`) to safely view and edit data files with automatic validation.
- All game data files in `data/` must adhere strictly to JSON standards and existing formatting.

### 3. Features & Bug Fixes (`app.js`, `styles.css`)
- Sotheby's Mansion is built with **pure vanilla HTML5, CSS3, and modern JavaScript (ESM)**. No heavy frameworks or build steps are required.
- Maintain compatibility with user `localStorage` keys (`r1999_*`).
- Always run the test suite before submitting:
   ```bash
   npm test
   ```

---

## Pull Request Checklist

Before submitting a PR:
- [ ] Follow existing code style and formatting.
- [ ] Test in at least one modern browser (Chrome, Firefox, or Edge).
- [ ] Ensure `npm test` passes without errors.
- [ ] If adding new UI text, add corresponding keys to `locales/en.json`, `locales/cn.json`, and `locales/vi.json`.
- [ ] Keep changes surgical: avoid formatting untouched lines.
