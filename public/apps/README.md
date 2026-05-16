# App screenshots for OurAppsShowcase

Drop a screenshot here named **exactly** like the app's slug to swap the stylized
brand card for a real preview in the "Five production apps" section.

| File                       | App                            |
|----------------------------|--------------------------------|
| `station-five.png`         | Station Five (car detailing)   |
| `solarmaxx.png`            | SolarMaxx (solar ops console)  |
| `bm-hub.png`               | BM Hub · Ads Command           |
| `flowbot.png`              | FlowBot (AI chatbot)           |
| `taskman.png`              | TaskMan (task system)          |

## Tips
- **Aspect ratio**: 16:10 looks best (we letterbox if not). 1600×1000 or 1920×1200 PNGs are perfect.
- **Crop**: capture the most product-y view — dashboards, charts, tables. Avoid login screens.
- **Format**: `.png` preferred. `.jpg` works if you also update the `screenshot` field in `lib/config.ts`.
- **Missing file** = card falls back to the stylized brand strip. No broken image icon ever shows.
- Files in `/public` are served at the matching URL: `/apps/station-five.png` etc.
