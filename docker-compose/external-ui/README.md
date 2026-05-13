# external-ui

Extends the default n8n UI with custom pages and visualizations alongside the main n8n interface.

## Stack

- **React 19** + **TypeScript**
- **Vite** (build tool)
- **Tailwind CSS v4** (styling)
- **react-router v7** (client-side routing)

## Dev

```sh
pnpm install
pnpm dev
```

Runs on `http://localhost:5173/ui/` with HMR. The Vite dev server uses `base: '/ui/'` to match the production path.

## Build

```sh
pnpm build
```

Output goes to `dist/` with all asset paths prefixed with `/ui/`.

## Production

Built files are served by the `external-hooks` Express app at `/ui` (e.g. `http://localhost:5678/ui/`). React Router uses `basename="/ui"` so client-side navigation works under that prefix.

## Routes

| Path       | Page    |
| ---------- | ------- |
| `/`        | Home    |
| `/about`   | About   |
| `/contact` | Contact |
