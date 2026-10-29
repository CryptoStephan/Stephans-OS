# Linux on the Web runtime

The files under `sys/`, `mods/`, and `coms/` originate from
https://github.com/linuxontheweb/linuxontheweb.github.io at commit
`847e69d7b16849a554b66fc9ca3e34077780b02c` (2026-10-20).

Included upstream files: `sys/config.js`, `sys/util.js`, `sys/fs.js`,
`mods/lang/shell.js`, `mods/util/math.js`, and `coms/fs.js`.
The filesystem, tokenizer, parser, execution engine, and original filesystem
commands are actual LOTW source, rather than a reimplementation presented as LOTW.

## Rights and attribution

The inspected upstream commit contains no license file or license grant covering
these core files. They retain their upstream authorship; the repository's MIT
license must not be read as relicensing this third-party source. The project
owner explicitly confirmed permission to reuse and publicly distribute LOTW's
code during this implementation. That owner-supplied permission is the basis
for inclusion; no published MIT or other upstream license is implied.

`bridge.js` and `index.html` are new Stephan's OS integration code. `list.json`
is an intentionally empty optional `/site` mount index.

## Focused changes to upstream

- Runtime script loading uses `/runtime/lotw/` rather than taking over site-root
  `/mods`, `/apps`, or `/coms` routes.
- Filesystem database, OPFS directory, and blob-ID counter are namespaced.
  Clearing the runtime's storage does not clear unrelated localStorage.
- Blob allocation checks both metadata and OPFS before using an ID, preventing
  overwrites if the localStorage allocation counter is cleared independently.
- Path normalization clamps `..` at `/`, and directory child dictionaries have
  null prototypes so names such as `__proto__` are ordinary filenames.
- Recursive removal no longer refers to an undefined variable; removal resolves
  the link itself rather than following a symbolic link to its target.
- Symbolic-link traversal propagates its recursion budget through parent links.
- Append writes await seeking and report the complete file size.
- The upstream `ls` lookup preserves a filename containing spaces.
- Async command failures settle their command's completion promise. Shell
  cancellation tracks nested active commands so a cancelled loop can return.
- `$?` exposes the previous command status; redirection errors return failure.
- Long command sequences yield to the browser periodically. Background jobs
  return an explicit unsupported error instead of bypassing the serialized
  filesystem bridge.

## Integration and additional behavior

One hidden same-origin iframe contains LOTW's global state and prototype
extensions. React communicates with it through source- and origin-checked
messages. Every desktop app shares the same filesystem; terminal sessions retain
independent working directories and environments. Mutations and shell execution
are serialized; reads, storage queries, and cancellation bypass that queue so
long-running commands do not freeze Files. Commands have a 110-second deadline,
and the client also sends cancellation if its response deadline expires. A lifetime Web Lock prevents a second
tab from racing LOTW's cached directory metadata.

The bridge adds or adapts `help`, `ls -la`, `mkdir -p`, `rm -r`, `ln -s`, `cp -r`,
`mv`, `tree`, `find`, `stat`, `head`, `tail`, `sort`, `uniq`, `history`, `date`,
`whoami`, `uname`, and `sleep`. Directory copies preserve empty folders and links;
failed copies attempt rollback. Deletion reclaims OPFS blobs only after checking
that no remaining hard link references them. Overwrite collisions in moves and
copies fail explicitly. Builtin `true` and `false` are silent.

## Limits

This is a browser filesystem and JavaScript shell, not a Linux kernel or full
POSIX environment. It cannot execute native binaries, package managers, or host
OS commands. Full-screen LOTW terminal applications (`vim`, `less`) are not
connected to the React terminal. Background jobs and multiple simultaneous
desktop tabs are intentionally unavailable. Browser storage is origin-specific
and subject to browser quotas, eviction, or manual clearing; export important
data. IndexedDB metadata and OPFS content are separate storage systems, so the
implementation does not claim a single atomic transaction across both.
