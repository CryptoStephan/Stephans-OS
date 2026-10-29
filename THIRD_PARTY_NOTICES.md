# Third-party notices

## Stephan’s OS

The project’s own code retains the [MIT license](LICENSE), copyright 2025 Stephan Volynets. That license does not automatically relicense separately attributed third-party source.

## Linux on the Web (LOTW)

- Source: [linuxontheweb/linuxontheweb.github.io](https://github.com/linuxontheweb/linuxontheweb.github.io)
- Pinned revision: [`847e69d7b16849a554b66fc9ca3e34077780b02c`](https://github.com/linuxontheweb/linuxontheweb.github.io/tree/847e69d7b16849a554b66fc9ca3e34077780b02c)
- Included source: `public/runtime/lotw/sys/config.js`, `sys/util.js`, `sys/fs.js`, `mods/lang/shell.js`, `mods/util/math.js`, and `coms/fs.js`.
- Attribution and modifications: [LOTW provenance](public/runtime/lotw/PROVENANCE.md).

The inspected upstream revision does not include a license file or a license grant covering these core files. The project owner explicitly confirmed permission to reuse and publicly distribute LOTW’s source during this implementation. Inclusion relies on that owner-supplied permission. This notice records that permission; it does not invent an upstream MIT license or a general license grant to other parties.

The original filesystem, shell, and command implementation retains its upstream authorship. The bridge, boot page, React client, and desktop integration are Stephan’s OS additions. Local changes to upstream code are documented beside the vendored source.

## daedalOS

- Author: Dustin Brett
- Source: [DustinBrett/daedalOS](https://github.com/DustinBrett/daedalOS)
- Pinned revision: [`ed9c7a54cc50a6e9125333743164830ad56779a5`](https://github.com/DustinBrett/daedalOS/tree/ed9c7a54cc50a6e9125333743164830ad56779a5)
- License: MIT, copyright 2025 Dustin Brett; the complete notice is retained in [lib/desktop/LICENSE.daedalOS](lib/desktop/LICENSE.daedalOS).

`lib/desktop/geometry.ts` adapts geometry helpers from `components/system/Window/functions.ts`. `lib/desktop/reducer.ts` adapts immutable process updates from `contexts/process/functions.ts`. See the [source mapping and adaptation notes](lib/desktop/PROVENANCE.md). The daedalOS BrowserFS backend, media assets, and full application suite are not bundled.

## Installed dependencies and services

Next.js, React, React DOM, and Lucide React are installed through npm. Development tools include TypeScript, tsx, Playwright, and TypeScript declaration packages. Their versions and dependency trees are recorded in `package.json` and `package-lock.json`; each package retains its distributed license and notices.

The Weather application requests city lookup and current weather from [Open-Meteo](https://open-meteo.com/) and displays provider attribution. External websites opened in the Browser application remain subject to their own terms and embedding restrictions.
