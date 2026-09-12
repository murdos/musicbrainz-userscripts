# Repository conventions

- Preserve and use Unicode typographical punctuation in prose and code comments, including curly quotation marks and apostrophes, em dashes, and ellipses.
- Never use `../` imports. Use the `~` path alias for modules outside the importing file’s directory; reserve `./` imports for modules in the same directory.
- Export declarations only when another module imports them. Minimalise the surface area.
- Keep feature-specific code with its owning userscript. Place code in `src/lib` only when multiple scripts reuse it.
