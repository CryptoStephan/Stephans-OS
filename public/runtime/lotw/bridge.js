/* Stephan's OS adapter. The filesystem and shell implementations are LOTW's.
 * This realm owns upstream prototype additions; none leak into React's realm.
 */
(() => {
  'use strict';
  const CHANNEL = 'stephans-os:lotw';
  const HOME = '/home/me';
  const REVISION = '847e69d7b16849a554b66fc9ca3e34077780b02c';
  const sessions = new Map();
  const pendingExecutions = new Map();
  const cancelledRequests = new Set();
  const noop = () => {};
  const send = message => parent.postMessage({ channel: CHANNEL, ...message }, location.origin);
  const changed = () => send({ type: 'changed' });
  const fs = LOTW.api.fs;
  const globals = LOTW.globals;
  let queue = Promise.resolve();
  let ShellMod;

  // Pure filesystem operations should not require upstream's desktop UI.
  LOTW.Desk = {
    isFake: true, make_icon_if_new: noop, make_all_icons: noop, move_icon_by_path: noop,
    update_folder_statuses: noop, cleanup_deleted_wins_and_icons: noop,
    update_win_paths: noop, clear_desk_icons: noop,
  };
  LOTW.api.widgets = { poperr: message => { throw new Error(String(message)); }, popyesno: async () => false };

  const pathOf = (value, cwd = HOME) => {
    if (typeof value !== 'string' || value.includes('\0')) throw new Error('Invalid file path.');
    const path = LOTW.api.util.normPath(value.replace(/^~(?=\/|$)/, HOME), cwd);
    if (!path) throw new Error('Invalid file path.');
    return path;
  };
  const nodeOf = async (path, follow = true) => {
    const fullPath = pathOf(path);
    const node = await fullPath.toNode({ getLink: !follow });
    if (!node) throw new Error(`${fullPath}: no such file or directory`);
    return node;
  };
  const assertWritable = node => {
    const parentNode = node.isDir ? node : node.par;
    if (!parentNode?.perm || !node.writeable || globals.read_only) throw new Error(`${node.fullpath}: permission denied`);
  };
  const entry = async node => ({
    name: node.name || '/', path: node.fullpath,
    type: node.isDir ? 'directory' : node.isLink ? 'symlink' : 'file',
    size: node.isFile ? ((await node.blob)?.size || 0) : 0,
    ...(node.isLink ? { linkTarget: node.symLink } : {}),
  });
  const parentAndName = async path => {
    const fullPath = pathOf(path);
    const index = fullPath.lastIndexOf('/');
    const name = fullPath.slice(index + 1);
    if (!name || name === '.' || name === '..') throw new Error('A file name is required.');
    const node = await nodeOf(fullPath.slice(0, index) || '/');
    if (!node.isDir) throw new Error(`${node.fullpath}: not a directory`);
    assertWritable(node);
    return [node, name, fullPath];
  };

  const operations = {
    async stat(path) { return entry(await nodeOf(path, false)); },
    async list(path) {
      const node = await nodeOf(path);
      if (!node.isDir) throw new Error(`${path}: not a directory`);
      await node.loadKids();
      return (await Promise.all(node.kidList.filter(child => child.name !== '.' && child.name !== '..').map(entry)))
        .sort((a, b) => (b.type === 'directory') - (a.type === 'directory') || a.name.localeCompare(b.name));
    },
    async readFile(path) {
      const node = await nodeOf(path);
      if (!node.isFile) throw new Error(`${path}: not a regular file`);
      return new Uint8Array(await (await node.blob).arrayBuffer());
    },
    async readText(path) { return new TextDecoder().decode(await operations.readFile(path)); },
    async writeFile(path, data, { exclusive = false } = {}) {
      const [parentNode, name, fullPath] = await parentAndName(path);
      if (exclusive && await fullPath.toNode({ getLink: true })) throw new Error(`${path}: already exists`);
      let node = await fullPath.toNode();
      if (node && !node.isFile) throw new Error(`${path}: not a regular file`);
      if (!node) node = await parentNode.mkNewFile(name);
      if (!node) throw new Error(`${path}: could not create file`);
      assertWritable(node);
      if (node.isWriteLocked) throw new Error(`${path}: file is busy`);
      const result = await node.setValue(typeof data === 'string' ? data : new Uint8Array(data));
      if (!result || !Number.isFinite(result.size)) throw new Error(`${path}: write failed`);
      return entry(node);
    },
    async mkdir(path) {
      const [parentNode, name, fullPath] = await parentAndName(path);
      if (await fullPath.toNode({ getLink: true })) throw new Error(`${path}: already exists`);
      const node = await parentNode.mkDir(name);
      if (!node) throw new Error(`${path}: could not create directory`);
      return entry(node);
    },
    async move(source, target) { await transfer(source, target, false); },
    async copy(source, target) { await transfer(source, target, true); },
    async remove(path, { recursive = false } = {}) {
      const node = await nodeOf(path, false);
      if (node.fullpath === HOME || node.fullpath === `${HOME}/Desktop` || node.fullpath === '/') throw new Error('This system directory cannot be removed.');
      assertWritable(node);
      if (node.isDir) await node.loadKids();
      const allowed = node.canRm({ isEmpty: !node.isDir || !node.haveKids, doFullDirs: recursive });
      if (allowed !== true) throw new Error(String(allowed));
      const blobIds = new Set();
      const collect = async current => {
        if (current.isFile && current.type === 'opfs' && Number.isFinite(current.blobId)) blobIds.add(current.blobId);
        if (current.isDir) { await current.loadKids(); for (const child of current.kidList) await collect(child); }
      };
      await collect(node);
      // Calling del on the lstat-style node removes a symlink itself, never its target.
      if (!await node.del()) throw new Error(`${path}: deletion failed`);
      // LOTW retains unlinked blobs for manual purge; reclaim only unreferenced data.
      for (const blobId of blobIds) {
        if (!(await fs.getNodesByBlobId(blobId)).length) {
          try { await (await fs.getBlobDir()).removeEntry(String(blobId)); }
          catch (error) { if (error.name !== 'NotFoundError') console.warn('Could not reclaim unlinked blob', error); }
        }
      }
    },
    async link(source, target, { symbolic = false } = {}) {
      const [parentNode, name, fullPath] = await parentAndName(target);
      if (await fullPath.toNode({ getLink: true })) throw new Error(`${target}: already exists`);
      let node;
      if (symbolic) node = await parentNode.mkSymLink(name, source, pathOf(source));
      else {
        const original = await nodeOf(source);
        if (!original.isFile || original.type !== 'opfs') throw new Error('Hard links require a stored file.');
        if (!Number.isFinite(original.blobId)) await original.getRealBlobId();
        node = await parentNode.mkHardLink(name, original.blobId);
      }
      if (!node) throw new Error(`${target}: link creation failed`);
      return entry(node);
    },
    async storage() {
      const estimate = await navigator.storage.estimate();
      return { usage: estimate.usage || 0, quota: estimate.quota || 0, persisted: await navigator.storage.persisted() };
    },
    async persist() { return navigator.storage.persist ? navigator.storage.persist() : false; },
    async execute(command, options = {}, requestId) {
      const sessionId = options.sessionId || 'default';
      let session = sessions.get(sessionId);
      if (!session) { session = createSession(); sessions.set(sessionId, session); }
      if (options.cwd) {
        const directory = await nodeOf(options.cwd);
        if (!directory.isDir) throw new Error('Working directory must be a directory.');
        session.term.env.cwd.cwd = directory.fullpath;
      }
      session.output = [];
      session.clear = false;
      session.requestId = requestId;
      session.term.history.push(command);
      session.term.env.vars.PWD = session.term.env.cwd.cwd;
      const shell = new ShellMod.Shell(session.term);
      session.shell = shell;
      const deadline = setTimeout(() => {
        session.term.response('Command exceeded 110 seconds and was cancelled.', { isErr: true });
        void operations.cancel(sessionId);
      }, 110000);
      let code = 0;
      try {
        const result = await shell.execute(command, { env: session.term.env, isInteractive: false });
        code = typeof result === 'number' ? result : session.output.some(line => line.kind === 'error') ? 1 : 0;
      } catch (error) { session.term.response(error.message || String(error), { isErr: true }); code = 1; }
      finally {
        await Promise.all(Array.from(shell.pendingMutationRuns || []));
        clearTimeout(deadline); session.shell = null;
      }
      session.term.env.vars.PWD = session.term.env.cwd.cwd;
      session.term.env.vars['?'] = String(code);
      return { code: shell.cancelled ? 130 : code, cwd: session.term.env.cwd.cwd, output: session.output, clear: session.clear };
    },
    async cancel(sessionId) {
      for (const id of pendingExecutions.get(sessionId) || []) cancelledRequests.add(id);
      const shell = sessions.get(sessionId)?.shell;
      if (shell) {
        shell.cancel();
        for (const command of shell.pipeline || []) command.end?.(130);
      }
    },
  };

  const transfer = async (source, target, copy) => {
    const sourcePath = pathOf(source);
    const targetPath = pathOf(target);
    const node = await nodeOf(sourcePath, false);
    if (sourcePath === HOME || sourcePath === `${HOME}/Desktop`) throw new Error('This system directory cannot be moved.');
    const existing = await targetPath.toNode({ getLink: true });
    const finalPath = existing?.isDir ? `${targetPath}/${node.name}` : targetPath;
    if (finalPath === sourcePath || finalPath.startsWith(`${sourcePath}/`)) throw new Error('Cannot move or copy a directory into itself.');
    if (await finalPath.toNode({ getLink: true })) throw new Error(`${finalPath}: already exists`);
    await parentAndName(finalPath);
    if (node.isLink) {
      await operations.link(node.symLink, finalPath, { symbolic: true });
      if (!copy) await operations.remove(sourcePath);
      return;
    }
    // Upstream directory copying does not handle empty folders or link children.
    // Keep its node storage, but walk copies explicitly with rollback on failure.
    if (copy) {
      if (node.isDir) {
        await operations.mkdir(finalPath);
        try {
          await node.loadKids();
          for (const child of node.kidList) await transfer(child.fullpath, `${finalPath}/${child.name}`, true);
        } catch (error) { await operations.remove(finalPath, { recursive: true }); throw error; }
      } else await operations.writeFile(finalPath, new Uint8Array(await (await node.blob).arrayBuffer()));
      return;
    }
    const errors = [];
    let completed = false;
    await fs.comMv([sourcePath, finalPath], {
      if_cp: copy, if_recur: true, if_force: false,
      exports: { cwd: HOME, werr: message => errors.push(message), winf: noop, done_cb: () => { completed = true; }, no_move_cb: noop },
    });
    if (errors.length) throw new Error(errors.join('\n'));
    if (!completed || !await finalPath.toNode({ getLink: true })) throw new Error(`${copy ? 'Copy' : 'Move'} failed.`);
  };

  const createSession = () => {
    const session = { output: [], clear: false, shell: null, requestId: null, term: null };
    const term = {
      env: { vars: { USER: 'me', HOME, PWD: HOME, TERM: 'stephans-os' }, cwd: { cwd: HOME }, funcs: {}, coms: { ...ShellMod.builtins, ...LOTW.coms.fs.coms } },
      w: 100, history: [], actor: null,
      response(value, options = {}) {
        if (value?.EOF) return;
        const text = typeof value === 'string' ? value : Array.isArray(value) ? value.join('\n') : String(value ?? '');
        const line = { text, kind: options.isErr ? 'error' : options.isWrn ? 'warning' : options.isInf || options.isSuc ? 'info' : 'stdout' };
        session.output.push(line);
        if (session.requestId) send({ type: 'output', id: session.requestId, value: line });
      },
      clear() { session.clear = true; session.output = []; },
      getHomedir: () => HOME, refresh: noop, render: noop, scrollIntoView: noop,
      addToHistoryBuffer: noop,
      readLine: async () => { throw new Error('Interactive stdin is unavailable here; use a pipe or file redirection.'); },
      getch: async () => { throw new Error('Interactive key input is unavailable in this terminal.'); },
      fmt: text => String(text).split('\n'),
      fmtLs(names, lengths, result, types) { result.push(names.map((name, i) => name + (types[i] === 'd' ? '/' : '')).join('  ')); },
    };
    session.term = term;
    installCommands(term.env.coms);
    return session;
  };

  const installCommands = coms => {
    const { Com } = ShellMod.comClasses;
    const simple = run => class extends Com { async run() { try { await run.call(this); this.ok(); } catch (error) { this.no(error.message || String(error)); } } };
    coms.true = class extends Com { run() { this.ok(); } };
    coms.false = class extends Com { run() { this.end(1); } };
    coms.help = simple(async function () {
      this.out('Stephan\'s OS — powered by the real Linux on the Web shell\n\nFiles: ls, cd, pwd, mkdir [-p], touch, cat, cp [-r], mv, rm [-r], ln [-s], tree, stat, find\nText: echo, grep, wc, cut, head, tail, sort, uniq\nSession: env, export, history, clear, whoami, date, uname, sleep, help\nShell: pipes |, > and >>, quotes, variables, $(commands), arithmetic, &&, ||, for/while, functions.\n\nFiles persist in this browser. Export a backup before clearing browser storage.\nFull-screen vim and less are not connected; use the desktop Text Editor.');
    });
    coms.whoami = simple(async function () { this.out(this.env.vars.USER); });
    coms.uname = simple(async function () { this.out('StephansOS LOTW browser runtime'); });
    coms.date = simple(async function () { this.out(new Date().toString()); });
    coms.history = simple(async function () { this.out(this.term.history.map((line, i) => `${i + 1}  ${line}`).join('\n')); });
    coms.sleep = simple(async function () {
      const seconds = Number(this.args[0]);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120) throw new Error('sleep: seconds must be between 0 and 120');
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    });
    for (const name of ['vim', 'vimtest', 'less', 'app', 'getch', '_purge', '_clearstorage']) coms[name] = simple(async function () { throw new Error(`${name}: unavailable in the desktop bridge. Use Files or Text Editor.`); });
    coms.ls = class extends Com {
      static getOpts() { return { s: { a: 1, l: 1, R: 1 }, l: { all: 1, recursive: 1 } }; }
      async run() {
        let failed = false;
        const printEntry = value => this.opts.l
          ? `${value.type === 'directory' ? 'd' : value.type === 'symlink' ? 'l' : '-'} ${String(value.size).padStart(9)}  ${value.name}${value.linkTarget ? ' -> ' + value.linkTarget : ''}`
          : value.name + (value.type === 'directory' ? '/' : value.type === 'symlink' ? '@' : '');
        const list = async (path, heading, depth = 0) => {
          if (depth > 64) throw new Error('Directory nesting exceeds 64 levels.');
          const node = await nodeOf(path, false);
          if (!node.isDir) { this.out(printEntry(await entry(node))); return; }
          let entries = await operations.list(path);
          if (!(this.opts.a || this.opts.all)) entries = entries.filter(item => !item.name.startsWith('.'));
          if (heading) this.out(path + ':');
          this.out(entries.map(printEntry).join(this.opts.l || !this.isTermOut ? '\n' : '  '));
          if (this.opts.R || this.opts.recursive) for (const item of entries) if (item.type === 'directory') await list(item.path, true, depth + 1);
        };
        for (const path of this.args.length ? this.args : ['.']) {
          try { await list(pathOf(path, this.env.cwd.cwd), this.args.length > 1); }
          catch (error) { failed = true; this.err(error.message); }
        }
        failed ? this.no() : this.ok();
      }
    };
    coms.mkdir = class extends Com {
      static getOpts() { return { s: { p: 1 } }; }
      async run() {
        try {
          if (!this.args.length) throw new Error('mkdir: missing directory');
          for (const value of this.args) {
            const path = pathOf(value, this.env.cwd.cwd);
            if (!this.opts.p) await operations.mkdir(path);
            else {
              let current = '';
              for (const part of path.split('/').filter(Boolean)) {
                current += '/' + part;
                const existing = await current.toNode();
                if (!existing) await operations.mkdir(current);
                else if (!existing.isDir) throw new Error(`${current}: not a directory`);
              }
            }
          }
          this.ok();
        } catch (error) { this.no(error.message); }
      }
    };
    coms.rm = class extends Com {
      static getOpts() { return { s: { r: 1, R: 1, f: 1 }, l: { recursive: 1, force: 1 } }; }
      async run() {
        if (!this.args.length && !this.opts.f && !this.opts.force) return this.no('rm: missing path');
        let failed = false;
        for (const value of this.args) {
          const path = pathOf(value, this.env.cwd.cwd);
          try {
            const node = await path.toNode({ getLink: true });
            if (!node && (this.opts.f || this.opts.force)) continue;
            if (node?.isDir && !(this.opts.r || this.opts.R || this.opts.recursive)) throw new Error(`${path}: is a directory (use -r)`);
            await operations.remove(path, { recursive: !!(this.opts.r || this.opts.R || this.opts.recursive) });
          } catch (error) { failed = true; this.err(error.message); }
        }
        failed ? this.no() : this.ok();
      }
    };
    coms.ln = class extends Com {
      static getOpts() { return { s: { s: 1 } }; }
      async run() {
        try {
          if (this.args.length !== 2) throw new Error('Usage: ln [-s] source destination');
          const source = this.opts.s ? this.args[0] : pathOf(this.args[0], this.env.cwd.cwd);
          await operations.link(source, pathOf(this.args[1], this.env.cwd.cwd), { symbolic: !!this.opts.s });
          this.ok();
        } catch (error) { this.no(error.message); }
      }
    };
    for (const name of ['cp', 'mv']) coms[name] = class extends Com {
      static getOpts() { return { s: { r: 1, R: 1 } }; }
      async run() {
        try {
          if (this.args.length < 2) throw new Error(`Usage: ${name} ${name === 'cp' ? '[-r] ' : ''}source destination`);
          const target = pathOf(this.args.pop(), this.env.cwd.cwd);
          if (this.args.length > 1 && !(await nodeOf(target)).isDir) throw new Error('Multiple sources require a destination directory.');
          for (const source of this.args) {
            const path = pathOf(source, this.env.cwd.cwd);
            if (name === 'cp' && (await nodeOf(path, false)).isDir && !(this.opts.r || this.opts.R)) throw new Error(`${source}: is a directory (use -r)`);
            await transfer(path, target, name === 'cp');
          }
          this.ok();
        } catch (error) { this.no(error.message); }
      }
    };
    coms.stat = simple(async function () {
      for (const path of this.args) {
        const value = await operations.stat(pathOf(path, this.env.cwd.cwd));
        this.out(`${value.path}\n  Type: ${value.type}  Size: ${value.size} bytes${value.linkTarget ? '\n  Target: ' + value.linkTarget : ''}`);
      }
    });
    for (const name of ['tree', 'find']) coms[name] = simple(async function () {
      const root = pathOf(this.args[0] || '.', this.env.cwd.cwd);
      this.out(root);
      const walk = async (path, prefix = '', depth = 0) => {
        if (depth > 64) throw new Error('Directory nesting exceeds 64 levels.');
        const children = await operations.list(path);
        for (let i = 0; i < children.length; i++) {
          const child = children[i], last = i === children.length - 1;
          this.out(name === 'find' ? child.path : `${prefix}${last ? '└── ' : '├── '}${child.name}${child.type === 'directory' ? '/' : ''}`);
          if (child.type === 'directory') await walk(child.path, prefix + (last ? '    ' : '│   '), depth + 1);
        }
      };
      await walk(root);
    });
    for (const name of ['head', 'tail', 'sort', 'uniq']) coms[name] = class extends Com {
      static getOpts() { return { s: { n: 3, r: 1 } }; }
      async run() {
        try {
          let lines = [];
          if (this.args.length) {
            for (const file of this.args) lines.push(...(await operations.readText(pathOf(file, this.env.cwd.cwd))).replace(/\n$/, '').split('\n'));
          } else if (this.pipeFrom || this.haveRedirIn) {
            while (!this.killed) {
              const chunk = await this.readStdinChunk();
              if (LOTW.api.util.isEOF(chunk)) break;
              lines.push(...String(chunk).split('\n'));
            }
          } else throw new Error(`${name}: supply a file, a pipe, or input redirection`);
          const count = this.opts.n === undefined ? 10 : Number(this.opts.n);
          if (!Number.isInteger(count) || count < 0) throw new Error('Line count must be a nonnegative integer.');
          if (name === 'head') lines = lines.slice(0, count);
          else if (name === 'tail') lines = count ? lines.slice(-count) : [];
          else if (name === 'sort') { lines.sort(); if (this.opts.r) lines.reverse(); }
          else lines = lines.filter((line, i, all) => !i || line !== all[i - 1]);
          this.out(lines.join('\n'));
          this.ok();
        } catch (error) { this.no(error.message); }
      }
    };
  };

  const initialize = async () => {
    if (!navigator.storage?.getDirectory || !window.indexedDB) throw new Error('This browser does not support the required OPFS and IndexedDB storage. Use a modern browser on HTTPS or localhost.');
    if (!await fs.init()) throw new Error('Could not initialize persistent storage.');
    await navigator.storage.getDirectory();
    ShellMod = globals.ShellMod = new LOTW.mods['lang.shell']();
    if (!await LOTW.api.util.loadComs('fs')) throw new Error('Could not load filesystem commands.');
    for (const name of ['Documents', 'Downloads', 'Pictures', 'Music', 'Videos']) {
      const path = `${HOME}/${name}`;
      if (!await path.toNode()) await operations.mkdir(path);
    }
    const welcome = `${HOME}/Documents/Welcome.md`;
    if (!await welcome.toNode()) await operations.writeFile(welcome,
      '# Welcome to Stephan\'s OS\n\nThis desktop uses Linux on the Web\'s actual persistent filesystem and shell.\n\nTry this in Terminal:\n\nmkdir -p ~/Documents/demo\necho "Hello from the shell" > ~/Documents/demo/hello.txt\ncat ~/Documents/demo/hello.txt | grep Hello\n\nOpen the same file in Files and Text Editor. Changes are shared immediately and survive reloads.\n\nStorage is local to this browser and this site. Download important files or export a backup before clearing site data.\n');
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.channel !== CHANNEL) return;
      const { id, method, args = [] } = event.data;
      if (!Object.prototype.hasOwnProperty.call(operations, method) || !Array.isArray(args)) return;
      const sessionId = method === 'execute' ? args[1]?.sessionId || 'default' : null;
      if (sessionId) {
        if (!pendingExecutions.has(sessionId)) pendingExecutions.set(sessionId, new Set());
        pendingExecutions.get(sessionId).add(id);
      }
      const perform = async () => {
        try {
          if (cancelledRequests.has(id)) {
            send({ type: 'result', id, value: { code: 130, cwd: sessions.get(sessionId)?.term.env.cwd.cwd || args[1]?.cwd || HOME, output: [], clear: false } });
            return;
          }
          const value = await operations[method](...args, ...(method === 'execute' ? [id] : []));
          send({ type: 'result', id, value });
          if (['writeFile', 'mkdir', 'move', 'copy', 'remove', 'link', 'execute'].includes(method)) changed();
        } catch (error) { send({ type: 'result', id, error: error.message || String(error) }); }
        finally {
          cancelledRequests.delete(id);
          if (sessionId) { const pending = pendingExecutions.get(sessionId); pending.delete(id); if (!pending.size) pendingExecutions.delete(sessionId); }
        }
      };
      // Reads do not wait behind long-running commands. Writes and shell execution
      // remain ordered; a command's completed mutation triggers a refresh event.
      if (['cancel', 'list', 'stat', 'readText', 'readFile', 'storage', 'persist'].includes(method)) perform();
      else queue = queue.then(perform, perform);
    });
    send({ type: 'ready', value: { home: HOME, engine: 'Linux on the Web', revision: REVISION, persistent: true } });
  };

  const start = async () => {
    if (!navigator.locks) throw new Error('This browser needs Web Locks to safely open the filesystem.');
    await navigator.locks.request('stephans-os-lotw-runtime-v1', { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('This desktop is already open in another tab. Close that tab, then reload to safely access your files.');
      await initialize();
      // Keep the cached upstream filesystem single-writer for this tab's lifetime.
      await new Promise(() => {});
    });
  };
  start().catch(error => send({ type: 'boot-error', error: error.message || String(error) }));
})();
