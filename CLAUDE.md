# AI Browser Blocker

## Tech Stack
- TypeScript, React 18, Vite
- Chrome Extension (Manifest V3) via vite-plugin-web-extension

## Commands
- `npm run dev` — Build with watch mode
- `npm run build` — Production build
- `npm run check` — Run all quality checks (tsc + eslint + prettier + knip)
- `npm run fix` — Auto-fix lint and formatting issues

## Workflow
- After making code changes, run `npm run check` to verify type safety, lint rules, and formatting.
- Use `npm run fix` to auto-fix formatting and lint issues before committing.
- Pre-commit hook runs lint-staged automatically (ESLint + Prettier on staged files).
- Clean up unused variables, functions, and imports unless explicitly told to keep them.

## Project Structure
- `src/background/` — Service worker (blocker, AI chat, timers)
- `src/content/` — Content scripts
- `src/popup/` — Extension popup UI (React)
- `src/blocked/` — Blocked page UI (React)
- `src/shared/` — Shared types, constants, storage utilities
