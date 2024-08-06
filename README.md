# Space Squid

> TypeScript fork of [Flying Squid](https://github.com/PrismarineJS/flying-squid) with a focus on better DX experince for plugins!

Minecraft lightweight server written in TypeScript (JS).

- Supports latest versions (up to ~1.20)
- Easily customizable in every aspect

## Installation

### Node.js

If you have Node.js installed, you can install `pnpm` or `npm`:

```bash
npm i -g @zardoy/flying-squid
```

```bash
flying-squid
```

It's recommended to also install `pm2` for process auto-restart on crashes and system reboots.

## Roadmap

| Feature          | Status                                                                |
| ---------------- | --------------------------------------------------------------------- |
| WebSocket        | Not started                                                           |
| Plugin API       | Done. Needs polishing                                                 |
| World Generation | Few simple generators available. Needs more                           |
| World Saving     | ✅ Doesn't support latest versions                                     |
| World Loading    | ✅ Full support for all versions, but writing can broke existing saves |
| Redstone         | Not started                                                           |
| Command Blocks   | ✅ Needs all commands implementation (50%)                             |
| Pvp              | Not started                                                           |
| Mobs             | ✅ Needs spawning, ai, a few physics fixes                             |

### Alternatives

### development

0. Clone, setup Node.js (at least v18.6.0)
1. Install dependencies: `npm install` or `pnpm install`
2. Run `npm run dev`, `npm run start` for without watch or `npm run watch` for watch mode (for prismarine-web-client)
2.1. If using [Bun](https://bun.sh) (experimental) instead: `bun --watch src/app.js` or `bun --hot src/app.js` (preview)
