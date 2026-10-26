# PWA icons

Drop these PNGs here before installing to the iOS home screen. Filenames are
referenced by `app/manifest.ts` and `app/layout.tsx`.

| File | Size | Notes |
| --- | --- | --- |
| `apple-touch-icon.png` | 180×180 | iOS home screen. No transparency, no rounded corners — iOS masks it. |
| `icon-192.png` | 192×192 | Manifest `any`. |
| `icon-512.png` | 512×512 | Manifest `any`, splash generation. |
| `icon-maskable-512.png` | 512×512 | Manifest `maskable`. Keep artwork inside the centre 80% safe zone. |
