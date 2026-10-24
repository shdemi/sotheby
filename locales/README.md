# Translation Guide for Sotheby's Mansion

We welcome all community contributions to translate Sotheby's Mansion into more languages (e.g. Japanese, Korean, German, Spanish, French, Russian, etc.) or improve existing translations!

---

## Supported Languages & Structure

Translations live in the `locales/` directory:
- `en.json` — English (Primary source)
- `cn.json` — Chinese (Simplified)
- `vi.json` — Vietnamese

Each file is a flat or nested JSON dictionary of `"key": "Translated Text"`.

Example from `locales/en.json`:
```json
"action.apply": "Apply",
"action.downloadPng": "Download PNG",
"setting.resonance": "Resonance",
"toolbar.search": "Search Characters"
```

Variables appear in brackets like `{n}` or `{name}`. Keep the variable placeholder intact in your translation.

---

## How to Contribute (Non-Developers)

1. Open `locales/en.json` and download or copy its contents.
2. Translate the values on the right-hand side of the colon `:`. Keep the keys on the left untouched.
3. Open a Pull Request on GitHub with a new file `locales/<lang-code>.json` (for example, `locales/ja.json`), or contact the maintainers.

---

## How to Contribute (Developers)

1. Fork and clone this repository.
2. In VS Code, install the extension **[i18n Ally](https://marketplace.visualstudio.com/items?itemName=lokalise.i18n-ally)**.
3. Set `en` as the source language.
4. Translate keys directly inside VS Code's editor interface without opening JSON files manually.
5. Create a new branch, commit your changes, and submit a Pull Request!

Thank you for helping players around the world enjoy Reverse: 1999!
