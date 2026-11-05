# AI Infrastructure Protein Demo — Template

Parameterizable frontend for the protein-folding inference demo. Edit
`src/config/institution.config.ts` and `src/config/theme.config.ts` to brand it for any institution —
same shared backend ([ai-infra-demo-proteins](https://github.com/WandLZhang/ai-infra-demo-proteins)),
no redeployment of inference lanes.

Ships with **Cornell** as the default. The setup wizard (gear icon on the home screen) helps
generate a new config for any institution.

## Quick start

```bash
# 1. Clone
git clone https://github.com/WandLZhang/ai-infra-demo-proteins-template.git
cd ai-infra-demo-proteins-template

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Fill in VITE_GOOGLE_MAPS_API_KEY and VITE_STATE_SERVER

# 4. (Optional) Edit src/config/institution.config.ts for a new institution
#    Or use the gear icon on the home screen to generate the config.

# 5. Dev server
npm run dev        # http://localhost:3000

# 6. Deploy
npm run build
firebase deploy --only hosting
```

## Configuration

### `src/config/institution.config.ts`

Institution identity, building coordinates, login node, and display bucket. Cornell values
are the defaults — edit for a new institution. The file also sets the home map's zoom and marker
label, extra markers for member sites, and `content`: the slide text that names the institution's
systems, labs and people.

The **setup wizard** (gear icon on the home-screen location card) provides a Google Maps
Places Autocomplete search to look up a building, auto-fills lat/lng and building name,
and generates the config to copy-paste.

### `src/config/theme.config.ts`

Accent color and light/dark mode. Components read from this file; CSS custom properties
derive from it.

### Talk track (slide narration)

`talk_track.md` is the run of show. It holds every slide's text, one collapsed panel per slide.
After editing it, copy the panels into `src/App.tsx`:

```bash
node scripts/sync-talk-track.mjs          # rewrite the slide text in src/App.tsx
node scripts/sync-talk-track.mjs --check  # exit 1 while App.tsx is out of date
```

Words in braces are placeholders. The app fills them from `institution.config.ts` when a slide
shows, so a new institution needs no edit to `talk_track.md` and no sync:

| Placeholder | Config field |
|---|---|
| `{institution}` | `institution.shortName` |
| `{loginNode}` | `home.loginNode` |
| `{bucket}` | `home.displayBucket` |
| `{controllerConsoleHref}` | `home.controllerConsoleHref` |
| `{intro}` | `content.intro`, the home slide's first paragraph |
| `{catalog:pd}`, `{catalog:db}`, `{catalog:md}` | `content.catalog`, who runs each workload shape |
| `{examples:<slide>}` | `content.examples`, one bullet per researcher or workload on that slide |

The shipped examples name workload types, not people. Replace them with the institution's own
researchers, each with a public source.

## Architecture

```
┌─────────────────────────────────────┐
│  This repo (frontend only)          │
│  Vite + React + Google Maps         │
│  Deployed to Firebase Hosting       │
└──────────────┬──────────────────────┘
               │ polls GCS + Cloud Run
┌──────────────▼──────────────────────┐
│  ai-infra-demo-proteins (backend)   │
│  6 inference lanes (ESMFold/AF2/    │
│  Boltz-2 × TPU/GPU) on Slurm       │
│  Cloud Run state server             │
│  GCS shared bucket                  │
└─────────────────────────────────────┘
```

The backend is **shared** — all institution frontends point at the same Cloud Run server
and GCS bucket (`VITE_STATE_SERVER` in `.env`). No backend redeployment needed.

## Files

| File | Purpose |
|---|---|
| `src/config/institution.config.ts` | Institution name, building, lat/lng, login node |
| `src/config/theme.config.ts` | Accent color, light/dark mode |
| `talk_track.md` | Every slide's text, with config placeholders |
| `scripts/sync-talk-track.mjs` | Copies the slide text from `talk_track.md` into `src/App.tsx` |
| `src/App.tsx` | Main app — reads config; slide text in the `sections` prop of `<InfoButton>` |
| `src/content.ts` | Fills the placeholders from the config |
| `src/markdown.ts` | Renders a slide's markdown |
| `src/components/InfraMap.tsx` | Google Maps with home marker from config |
| `src/components/SetupWizard.tsx` | Gear-icon config generator with Places Autocomplete |
| `.env.example` | Environment variables (Maps API key, state server URL) |

## Tests

The Maps key loads only on the hosts in its referrer list, so the map tests run against a deployed
URL. Add the host to the key's list first.

```bash
FRONTEND_URL=https://<site>.web.app npx playwright test tests/models-slides.spec.ts \
  tests/models-with-info-open.spec.ts tests/md-doll-inspect.spec.ts tests/bucket-label.spec.ts
```

Each test presses Enter on the login node. That starts a real run on the shared backend, or
attaches to the run in flight. The `e2e-*` specs wait for a whole run, up to about 10 minutes.

## TODO: compete points to add

- **TorchTPU serving and RL stacks** (`tpu3`): replace the default examples with lines from
  TorchTPU's public launch posts, starting with the
  [launch blog](https://developers.googleblog.com/torchtpu-running-pytorch-natively-on-tpus-at-google-scale/)
  and the [repo](https://github.com/google-pytorch/torch_tpu).
- **DWS prices** (`pd2`): the [pricing page](https://cloud.google.com/products/dws/pricing) says
  Flex-start and Calendar Mode prices are scheduled to be updated in November 2026. Recheck the
  slide after the update, and recheck the AWS H200 15% line.
- **RTX PRO 6000 price** (`img`): add the price from the public
  [GPU pricing page](https://cloud.google.com/compute/gpus-pricing) only.
