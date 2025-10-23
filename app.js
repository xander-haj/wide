// /app.js
/* global localStorage, Blob, URL, Terminal */
(function(){
  'use strict';

  // ----------------------------
  // Utilities
  // ----------------------------
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  /**
   * Debounce helper to throttle function calls.
   * @param {Function} fn The function to debounce
   * @param {number} ms Time in milliseconds
   */
  const debounce = (fn, ms=300) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };
  /**
   * Create a downloadable link and trigger a download for the given data.
   * @param {string} filename Name of the file to download
   * @param {Blob|string|Uint8Array} data Data blob or string
   * @param {string} type MIME type
   */
  const download = (filename, data, type="application/octet-stream") => {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ----------------------------
  // Initial Project
  // ----------------------------
  /**
   * Starter files for a new project. These are injected when no project is
   * present in localStorage. Users can freely edit these files.
   */
  const STARTER_FILES = {
    "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Starter — Web IDE</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main class="container">
    <h1>Welcome 🎉</h1>
    <p>You are running the starter project. Edit <code>index.html</code>, <code>style.css</code>, and <code>script.js</code> and click <strong>Run ▶</strong> or enable <strong>Auto-run</strong>.</p>
    <button id="helloBtn">Click me</button>
  </main>
  <script src="./script.js"></script>
</body>
</html>`,
    "style.css": `/* Starter styles */
body{font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto; margin:0; padding:0; background:#0b0e14; color:#d6deeb}
.container{max-width:820px; margin:6rem auto; padding:0 1rem}
h1{font-size:2.2rem; margin-bottom:.5rem}
p{color:#9aa4b2}
button{padding:.65rem 1rem; border-radius:.6rem; border:1px solid #1f2534; background:#171c2a; color:#d6deeb; cursor:pointer}`,
    "script.js": `document.getElementById('helloBtn')?.addEventListener('click', ()=>{
  alert('Hello from Web IDE starter!');
});`
  };

  /** LocalStorage key for persisting projects. */
  const STORAGE_KEY = "web-ide-project";

  // ----------------------------
  // State
  // ----------------------------
  /**
   * Holds the current project: a mapping of file names to their contents.
   * This object is mutated when the user edits files.
   * @type {Record<string,string>|null}
   */
  let project = null;
  /** Currently open file in the editor. */
  let openFile = "index.html";
  /** Whether auto-run preview is enabled. */
  let autoRun = true;

  /**
   * Load project from localStorage or fall back to starter files.
   */
  function loadProject(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      try{
        project = JSON.parse(raw);
      }catch{
        project = { ...STARTER_FILES };
      }
    }else{
      project = { ...STARTER_FILES };
    }
    // Ensure core files always exist
    if(!project["index.html"]) project["index.html"] = STARTER_FILES["index.html"];
    if(!project["style.css"])  project["style.css"]  = STARTER_FILES["style.css"];
    if(!project["script.js"])  project["script.js"]  = STARTER_FILES["script.js"];
  }
  /**
   * Persist the current project to localStorage.
   */
  function saveProject(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }

  // ----------------------------
  // UI Bindings
  // ----------------------------
  const fileListEl = $("#fileList");
  const tabbarEl = $(".tabbar");
  const editorEl = $("#editorArea");
  const cursorPosEl = $("#cursorPos");
  const fileMetaEl = $("#fileMeta");
  const previewFrame = $("#previewFrame");
  const autoRunEl = $("#autoRun");

  const newFileBtn = $("#newFileBtn");
  const saveFileBtn = $("#saveFileBtn");
  const renameFileBtn = $("#renameFileBtn");
  const deleteFileBtn = $("#deleteFileBtn");
  const runBtn = $("#runBtn");
  const downloadBtn = $("#downloadBtn");
  const resetBtn = $("#resetBtn");
  const themeBtn = $("#themeBtn");
  const newItemInput = $("#newItemInput");
  const createItemBtn = $("#createItemBtn");
  const importBtn = $("#importBtn");
  const exportBtn = $("#exportBtn");

  // Batch-create modal and its controls
  const batchCreateBtn = $("#batchCreateBtn");
  const treeModal = $("#treeModal");
  const treeInput = $("#treeInput");
  const treeGenerateBtn = $("#treeGenerateBtn");
  const treeCancelBtn = $("#treeCancelBtn");

  // Pane/Terminal refs
  const paneBtnPreview = $("#paneBtnPreview");
  const paneBtnTerminal = $("#paneBtnTerminal");
  const terminalListEl = $("#terminalList");
  const terminalClearBtn = $("#terminalClearBtn");
  const terminalCopyBtn = $("#terminalCopyBtn");
  const terminalAutoScrollEl = $("#terminalAutoScroll");

  // ----------------------------
  // Rendering helpers
  // ----------------------------
  /**
   * Render the list of files in the sidebar. Optionally filters by a search string.
   * @param {string} filter Substring to filter file names
   */
  function renderFileList(filter=""){
    // Render the file list with visual indentation and icons for directories and files. The
    // path depth (number of nested folders) is used to indent each entry, and only
    // the base name of the file or folder is displayed for readability. A folder
    // is indicated by a trailing slash in the stored key or a null value.
    const files = Object.keys(project).sort();
    fileListEl.innerHTML = "";
    for(const f of files){
      const li = document.createElement("li");
      li.setAttribute("role","treeitem");
      li.dataset.file = f;
      li.className = f === openFile ? "active" : "";
      const isDir = f.endsWith("/") || project[f] === null;
      // Split the path into segments and determine the depth. Directories and files
      // both split on '/', ignoring empty segments. Depth is (segments length - 1).
      const parts = f.split('/').filter(p => p.length > 0);
      const depth = Math.max(parts.length - 1, 0);
      // Determine the base name and append '/' for directories
      const base = parts[parts.length - 1] || "";
      const baseName = isDir ? `${base}/` : base;
      // Build the display text with a simple icon prefix for files/folders
      const icon = isDir ? '📁' : '📄';
      const nameSpan = document.createElement("span");
      nameSpan.textContent = `${icon} ${baseName}`;
      // Indent based on depth
      li.style.paddingLeft = `${depth * 16}px`;
      const badgeSpan = document.createElement("span");
      badgeSpan.className = "file-badge";
      if(isDir){
        badgeSpan.textContent = "dir";
      }else{
        const len = (project[f] || "").length;
        badgeSpan.textContent = `${len} ch`;
      }
      li.append(nameSpan, badgeSpan);
      li.addEventListener("click", () => open(f));
      fileListEl.append(li);
    }
  }
  /**
   * Render the tab bar for open files.
   */
  function renderTabs(){
    // Show only the currently open file as a tab. All other files are
    // selected via the sidebar. This simplifies the UI for models that
    // interact via the file list and avoids clutter from many open tabs.
    tabbarEl.innerHTML = "";
    if(openFile && !(openFile.endsWith('/') || project[openFile] === null)){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role","tab");
      btn.textContent = openFile;
      btn.classList.add("active");
      btn.addEventListener("click", () => open(openFile));
      tabbarEl.append(btn);
    }
  }
  /**
   * Render the editor contents for the currently open file.
   */
  function renderEditor(){
    editorEl.value = project[openFile] ?? "";
    editorEl.focus();
    updateCursorPos();
  }
  /**
   * Update the cursor position indicator in the status bar.
   */
  function updateCursorPos(){
    const { selectionStart } = editorEl;
    const textUptoCursor = editorEl.value.slice(0, selectionStart);
    const lines = textUptoCursor.split("\n");
    const line = lines.length;
    const col = (lines[lines.length-1] || "").length + 1;
    cursorPosEl.textContent = `Ln ${line}, Col ${col}`;
  }
  /**
   * Open the given file in the editor and update UI accordingly.
   * @param {string} fname File name to open
   */
  function open(fname){
    if(!(fname in project)) return;
    // Do not open directories
    if(fname.endsWith('/')) return;
    openFile = fname;
    renderTabs();
    renderFileList();
    renderEditor();
  }

  // ----------------------------
  // Preview & Error Checking
  // ----------------------------
  /**
   * Build the HTML content for the preview iframe by inlining CSS and JS.
   * Also injects an error bridge script to relay console messages and errors.
   * @returns {string} The assembled HTML document
   */
  function buildPreviewHTML(){
    // Determine the HTML content to start with. Default to the project's
    // `index.html` file if it exists. If it doesn't, fall back to an empty
    // string to avoid injecting undefined into the preview.
    const html = project["index.html"] || "";
    // Collect and concatenate all CSS files in the project. This allows the
    // preview iframe to reflect styles from any number of `.css` files the
    // user has created, including those nested in directories. Directory
    // placeholders (entries ending with `/`) are ignored.
    const css = Object.keys(project)
      .filter((fname) => fname.toLowerCase().endsWith(".css") && !fname.endsWith("/"))
      .map((fname) => project[fname] || "")
      .join("\n");
    // Similarly collect and concatenate all JavaScript files in the project.
    // This ensures that any `.js` files the user creates will execute in the
    // preview, regardless of their names or folder structure.
    const js = Object.keys(project)
      .filter((fname) => fname.toLowerCase().endsWith(".js") && !fname.endsWith("/"))
      .map((fname) => project[fname] || "")
      .join("\n");

    // Bridge to forward errors/console from iframe
    const bridge = `<script id="__error_bridge__">
(function(){
  function send(type,payload){ try{ parent.postMessage({__WEB_IDE_ERROR:type, payload}, "*"); }catch(e){} }
  (function(){
    var oErr = console.error, oWarn = console.warn, oInfo = console.info, oLog = console.log;
    console.__origError = oErr; console.__origWarn = oWarn; console.__origInfo = oInfo; console.__origLog = oLog;
    console.error = function(){ send("console.error", {message:[].map.call(arguments, String).join(" ")}); try{ oErr.apply(console, arguments); }catch(e){} };
    console.warn  = function(){ send("console.warn",  {message:[].map.call(arguments, String).join(" ")}); try{ oWarn.apply(console, arguments); }catch(e){} };
    console.info  = function(){ send("console.info",  {message:[].map.call(arguments, String).join(" ")}); try{ oInfo.apply(console, arguments); }catch(e){} };
    console.log   = function(){ send("console.log",   {message:[].map.call(arguments, String).join(" ")}); try{ oLog.apply(console, arguments); }catch(e){} };
  })();
  window.addEventListener("error", function(e){
    send("error", {message:e.message, filename:e.filename || (e.target && e.target.src) || "", lineno:e.lineno||0, colno:e.colno||0, stack:e.error && e.error.stack || ""});
  });
  window.addEventListener("unhandledrejection", function(e){
    var r = e.reason || {};
    send("unhandledrejection", {message: r && (r.message || (r.toString && r.toString())) || "Unhandled rejection", filename:"", lineno:0, colno:0, stack: r && r.stack || ""});
  });
})();
</script>`;

    // Inline the user's CSS and JS into the HTML for the iframe
    let out = html;
    const styleTag = `<style id="__inline_style__">\n${css}\n</style>`;
    // Escape any closing `</script>` sequences in the concatenated JavaScript to
    // prevent prematurely terminating the script block when inlined. A simple
    // replacement is performed here to avoid breaking out of the script tag.
    const escapedJS = js.replace(/<\//g, "<\\/");
    const scriptTag = `${bridge}\n<script id="__inline_script__">\n${escapedJS}\n<\/script>`;

    if(/<head[\s\S]*?>/i.test(out)){
      out = out.replace(/<head[\s\S]*?>/i, m => m)
               .replace(/<\/head>/i, styleTag + "\n</head>");
    }else{
      out = styleTag + "\n" + out;
    }
    if(/<\/body>/i.test(out)){
      out = out.replace(/<\/body>/i, scriptTag + "\n</body>");
    }else{
      out += "\n" + scriptTag;
    }
    return out;
  }
  /**
   * Perform quick checks on an HTML file to catch common mistakes. Errors are
   * logged with the file name so the user knows which file needs attention.
   * @param {string} fname The file name (must end with .html)
   */
  function checkHTMLFile(fname){
    const html = project[fname] || "";
    // Detect misspelt <script> tags (e.g., <scirpt>)
    if(/<\/?\s*scirpt\b/i.test(html)){
      Terminal.log({level:"error", source:"html", message:"Found '<scirpt>' or '</scirpt>' — did you mean '<script>' or '</script>'?", filename: fname});
    }
    // Ensure script tags are balanced
    const openScripts = (html.match(/<script\b[^>]*>/gi) || []).length;
    const closeScripts = (html.match(/<\/script>/gi) || []).length;
    if(openScripts !== closeScripts){
      Terminal.log({level:"error", source:"html", message:`Mismatched <script> tags: found ${openScripts} openings but ${closeScripts} closings.`, filename: fname});
    }
    // Warn about stray content after </html>
    const afterHtml = html.split(/<\/html>/i)[1];
    if(afterHtml && afterHtml.trim().length){
      Terminal.log({level:"warn", source:"html", message:"There is content after </html>. Move stray text inside <body> or remove it.", filename: fname});
    }
    // Check inline <script> blocks for syntax errors
    const inlineBlocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1] || "");
    inlineBlocks.forEach((code, i) => {
      try{ new Function(code); }
      catch(err){
        Terminal.log({level:"error", source:"html-inline-js", message:`Inline <script> #${i+1} syntax error: ${err.message}`, filename: fname, stack: err.stack || ""});
      }
    });

    // Check for mismatched <html> and </html> tags
    const openHtmls  = (html.match(/<html\b/gi) || []).length;
    const closeHtmls = (html.match(/<\/html>/gi) || []).length;
    if(openHtmls !== closeHtmls){
      Terminal.log({ level: "error", source: "html", message: `Mismatched <html> tags: found ${openHtmls} <html> opening tag(s) but ${closeHtmls} closing tag(s).`, filename: fname });
    }
  }
  /**
   * Runs the preview by assembling the HTML document, clearing previous logs,
   * performing preflight checks, and loading the new document into the iframe.
   */
  const runPreview = debounce(() => {
    Terminal.clear();
    preflightChecks();
    const html = buildPreviewHTML();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    previewFrame.src = url;
    previewFrame.addEventListener('load', () => {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, { once: true });
  }, 150);

  // ----------------------------
  // Project Actions
  // ----------------------------
  /**
   * Create a new file in the project after prompting the user for a name.
   */
  function newFile(name){
    let fname = name;
    if(!fname){
      const input = prompt("Enter new file or directory name (end directories with '/'): ") || "";
      if(!input) return;
      fname = input;
    }
    fname = fname.trim();
    if(!fname) return;
    if(project[fname]){
      alert("A file or folder with that name already exists.");
      return;
    }
    // Detect directory creation by trailing slash
    if(fname.endsWith('/')){
      project[fname] = null;
      saveProject();
      // Update UI but do not open a directory
      renderTabs();
      renderFileList();
      return;
    }
    // If the filename contains slashes (e.g., src/app.js), ensure all parent directories exist
    if(fname.includes('/')){
      const segments = fname.split('/');
      for(let i=0; i < segments.length - 1; i++){
        const dirPath = segments.slice(0, i+1).join('/') + '/';
        if(!project[dirPath]){
          project[dirPath] = null;
        }
      }
    }
    let stub = "";
    const lower = fname.toLowerCase();
    if(lower.endsWith(".html")){
      stub = "<!doctype html>\\n<html lang=\\\"en\\\">\\n<head>\\n  <meta charset=\\\"UTF-8\\\">\\n  <meta name=\\\"viewport\\\" content=\\\"width=device-width, initial-scale=1.0\\\">\\n  <title>New Page</title>\\n</head>\\n<body>\\n  <h1>New Page</h1>\\n</body>\\n</html>";
    }else if(lower.endsWith(".css")){
      stub = "/* New stylesheet */\\n";
    }else if(lower.endsWith(".js")){
      stub = "// New script\\n";
    }
    project[fname] = stub;
    saveProject();
    open(fname);
  }
  /** Save the currently open file to the project and optionally run preview. */
  function saveCurrent(){
    if(openFile && !openFile.endsWith('/')){
      project[openFile] = editorEl.value;
      saveProject();
      fileMetaEl.textContent = `Saved ${openFile} • ${new Date().toLocaleTimeString()}`;
      if(autoRun) runPreview();
      renderFileList();
    }
  }
  /** Rename the currently open file, updating project keys accordingly. */
  function renameCurrent(){
    const newNameRaw = prompt("Rename file to:", openFile);
    if(!newNameRaw || newNameRaw === openFile) return;
    let newName = newNameRaw.trim();
    // For directories ensure trailing slash
    if(openFile.endsWith('/') && !newName.endsWith('/')){
      newName += '/';
    }
    if(project[newName]){
      alert("A file or folder with that name already exists.");
      return;
    }
    if(openFile.endsWith('/')){
      // Rename directory and its children
      const updated = {};
      for(const k of Object.keys(project)){
        if(k === openFile || k.startsWith(openFile)){
          const suffix = k.slice(openFile.length);
          const newKey = newName + suffix;
          updated[newKey] = project[k];
        }else{
          updated[k] = project[k];
        }
      }
      project = updated;
      saveProject();
      openFile = newName;
      renderTabs();
      renderFileList();
      renderEditor();
    } else {
      // Rename file
      project[newName] = project[openFile];
      delete project[openFile];
      saveProject();
      open(newName);
    }
  }
  /** Permanently delete the currently open file after user confirmation. */
  function deleteCurrent(){
    if(!confirm(`Delete ${openFile}? This cannot be undone.`)) return;
    const isDir = openFile.endsWith('/') || project[openFile] === null;
    if(isDir){
      // Remove directory and all nested files
      for(const k of Object.keys(project)){
        if(k === openFile || k.startsWith(openFile)){
          delete project[k];
        }
      }
    }else{
      delete project[openFile];
    }
    saveProject();
    // Determine next file to open: choose the next available non-directory file
    const files = Object.keys(project).filter(name => !(name.endsWith('/') || project[name] === null)).sort();
    let next = files.find(name => name !== openFile) || files[0] || null;
    if(!next){
      // No files left, create a blank placeholder file
      project["index.html"] = "";
      saveProject();
      next = "index.html";
    }
    open(next);
  }
  /** Reset the entire project back to the starter files after confirmation. */
  function resetProject(){
    if(!confirm("Reset project to starter files? This will erase your local changes.")) return;
    project = { ...STARTER_FILES };
    saveProject();
    openFile = "index.html";
    renderTabs();
    renderFileList();
    renderEditor();
    runPreview();
  }
  /** Export the project as a JSON file that can be re-imported later. */
  function exportJSON(){
    const data = JSON.stringify(project, null, 2);
    download("project.json", data, "application/json;charset=utf-8");
  }
  /** Prompt the user to select a JSON file and import it as the current project. */
  function importJSON(){
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.onchange = async () => {
      const file = inp.files?.[0];
      if(!file) return;
      const text = await file.text();
      try{
        const obj = JSON.parse(text);
        if(typeof obj !== "object" || Array.isArray(obj)) throw new Error("Invalid");
        project = obj;
        saveProject();
        openFile = Object.keys(project)[0] || "index.html";
        renderTabs();
        renderFileList();
        renderEditor();
        runPreview();
      }catch(err){
        alert("Invalid project JSON.");
      }
    };
    inp.click();
  }
  /** Assemble a zip file from the current project contents and trigger download. */
  async function downloadZip(){
    const files = Object.entries(project).map(([name, content]) => ({ name, data: new TextEncoder().encode(content) }));
    const blob = buildZip(files);
    download("project.zip", blob, "application/zip");
  }

  // Minimal ZIP (STORE) implementation
  /**
   * Build a simple ZIP archive (without compression) from the provided entries.
   * @param {Array<{name:string,data:Uint8Array}>} entries
   * @returns {Blob}
   */
  function buildZip(entries){
    const LFH_SIG = 0x04034b50;
    const CDH_SIG = 0x02014b50;
    const EOCD_SIG = 0x06054b50;
    function dosDateTime(d = new Date()){
      const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((Math.floor(d.getSeconds()/2)) & 0x1f);
      const date = (((d.getFullYear()-1980) & 0x7f) << 9) | (((d.getMonth()+1) & 0xf) << 5) | (d.getDate() & 0x1f);
      return { time, date };
    }
    function write32(v, off, x){ v.setUint32(off, x >>> 0, true); }
    function write16(v, off, x){ v.setUint16(off, x & 0xffff, true); }

    const CRC_TABLE = (() => {
      let c; const table = new Uint32Array(256);
      for(let n=0;n<256;n++){
        c = n;
        for(let k=0;k<8;k++){
          c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
      }
      return table;
    })();
    function crc32(buf){
      let c = 0xffffffff;
      for(let i=0;i<buf.length;i++){
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      }
      return (c ^ 0xffffffff) >>> 0;
    }
    const parts = [];
    const central = [];
    let offset = 0;
    const now = dosDateTime();
    for(const { name, data } of entries){
      const nameBytes = new TextEncoder().encode(name);
      const crc = crc32(data);
      const size = data.length;
      const lfh = new ArrayBuffer(30);
      const lv = new DataView(lfh);
      write32(lv, 0, LFH_SIG);
      write16(lv, 4, 20);
      write16(lv, 6, 0);
      write16(lv, 8, 0);
      write16(lv,10, now.time);
      write16(lv,12, now.date);
      write32(lv,14, crc);
      write32(lv,18, size);
      write32(lv,22, size);
      write16(lv,26, nameBytes.length);
      write16(lv,28, 0);
      parts.push(new Uint8Array(lfh)); offset += 30;
      parts.push(nameBytes); offset += nameBytes.length;
      parts.push(data); offset += data.length;
      const cdh = new ArrayBuffer(46);
      const cv = new DataView(cdh);
      write32(cv, 0, CDH_SIG);
      write16(cv, 4, 20);
      write16(cv, 6, 20);
      write16(cv, 8, 0);
      write16(cv,10, 0);
      write16(cv,12, now.time);
      write16(cv,14, now.date);
      write32(cv,16, crc);
      write32(cv,20, size);
      write32(cv,24, size);
      write16(cv,28, nameBytes.length);
      write16(cv,30, 0);
      write16(cv,32, 0);
      write16(cv,34, 0);
      write16(cv,36, 0);
      write32(cv,38, 0);
      write32(cv,42, (offset - data.length - nameBytes.length - 30) >>> 0);
      central.push(new Uint8Array(cdh));
      central.push(nameBytes);
    }
    const centralSize = central.reduce((n, u8) => n + u8.length, 0);
    const centralOffset = offset;
    const out = new Uint8Array(offset + centralSize + 22);
    let pos = 0;
    for(const part of parts){ out.set(part, pos); pos += part.length; }
    for(const part of central){ out.set(part, pos); pos += part.length; }
    const eocd = new DataView(out.buffer, pos, 22);
    write32(eocd, 0, EOCD_SIG);
    write16(eocd, 4, 0);
    write16(eocd, 6, 0);
    write16(eocd, 8, entries.length);
    write16(eocd,10, entries.length);
    write32(eocd,12, centralSize >>> 0);
    write32(eocd,16, centralOffset >>> 0);
    write16(eocd,20, 0);
    return new Blob([out], { type: "application/zip" });
  }

  // ----------------------------
  // Batch Create from Tree
  // ----------------------------
  /**
   * Parse an ASCII-style file tree into a list of entries. Each entry
   * contains the full path and whether it represents a directory. The tree
   * format may use characters such as ├─, └─, │ and indentation to denote
   * nesting levels. A trailing slash (/) on a name indicates a directory.
   *
   * @param {string} tree The raw tree string provided by the user
   * @returns {Array<{path:string, dir:boolean}>} A list of file/directory entries
   */
  function parseTree(tree){
    const lines = (tree || "").split(/\r?\n/).filter(l => l.trim().length > 0);
    const entries = [];
    let stack = [];
    let rootSet = false;
    for(let i=0; i<lines.length; i++){
      const raw = lines[i];
      // Count leading spaces to determine indentation. Each level is assumed to be 3 spaces.
      let spaceCount = 0;
      while(spaceCount < raw.length && raw[spaceCount] === ' ') spaceCount++;
      let indent = Math.floor(spaceCount / 3);
      // Extract the label by stripping drawing characters (├, └, │, ─) from the trimmed segment
      let label = raw.trim().replace(/[├└│─]+/g, '').trim();
      if(!label) continue;
      // If this is the first line and it denotes a directory (ends with slash), treat it as the root folder
      if(i === 0 && label.endsWith('/')){
        rootSet = true;
        stack = [label];
        entries.push({ path: label, dir: true });
        continue;
      }
      // When a root directory exists, indent levels for subsequent lines start from 1
      if(rootSet){
        indent += 1;
      }
      // Adjust the stack to match the current indentation level
      while(stack.length > indent){
        stack.pop();
      }
      // Build the full path using the current stack up to the indent level
      let base = '';
      if(indent > 0){
        base = stack.slice(0, indent).join('');
      }
      const fullPath = base + label;
      if(label.endsWith('/')){
        // Directory entry
        entries.push({ path: fullPath, dir: true });
        // Update the stack for this indentation level
        if(stack.length > indent){
          stack[indent] = label;
        } else {
          stack.push(label);
        }
      } else {
        entries.push({ path: fullPath, dir: false });
      }
    }
    return entries;
  }

  /**
   * Given a file tree string, create blank files and directories within the
   * current project. Existing files or folders will not be overwritten.
   * Directory entries are stored as keys ending with '/' and assigned `null`.
   * File entries are stored with an empty string as their content. Any
   * missing parent directories are also created automatically.
   *
   * @param {string} tree A string representing the desired file tree
   */
  function createFromTree(tree){
    // Clear the current project so only the new files/directories remain. This
    // creates a fresh workspace before generating the new file tree.
    project = {};
    openFile = null;
    const list = parseTree(tree);
    for(const { path, dir } of list){
      if(!path) continue;
      if(dir){
        // Ensure directory exists
        if(!project[path]){
          project[path] = null;
        }
      } else {
        // Ensure parent directories exist
        if(path.includes('/')){
          const parts = path.split('/');
          // parts will include file name at last index; we create directories for preceding segments
          let accum = '';
          for(let i=0; i < parts.length - 1; i++){
            const seg = parts[i];
            accum += seg + '/';
            if(!project[accum]){
              project[accum] = null;
            }
          }
        }
        // Create blank file if it doesn't exist
        if(!project[path]){
          project[path] = '';
        }
      }
    }
    // Persist changes
    saveProject();
    // Determine the first non-directory file to open (if any)
    const files = Object.keys(project).filter(name => !(name.endsWith('/') || project[name] === null)).sort();
    openFile = files[0] || null;
    // Refresh UI: tabs, file list, editor, and optionally run preview
    renderTabs();
    renderFileList();
    renderEditor();
    if(autoRun) runPreview();
  }

  // ----------------------------
  // Preflight checks
  // ----------------------------
  /**
   * Perform quick syntax checks on HTML/JS/CSS before running the preview.
   */
  function preflightChecks(){
    // Iterate through all files in the project and perform syntax checks based on extension
    for(const fname of Object.keys(project)){
      const content = project[fname] || "";
      if(fname.toLowerCase().endsWith('.html')){
        // Check HTML structure and inline scripts
        checkHTMLFile(fname);
      } else if(fname.toLowerCase().endsWith('.js')){
        // Check JavaScript syntax using Function constructor
        try{ new Function(content); }
        catch(err){
          Terminal.log({ level: "error", source: "syntax", message: err.message || "JavaScript syntax error", filename: fname, lineno: err.lineNumber || 0, colno: err.columnNumber || 0, stack: err.stack || "" });
        }
      } else if(fname.toLowerCase().endsWith('.css')){
        // Perform a lightweight CSS syntax check. First use the CSSStyleSheet API where available,
        // then fall back to a manual line-based check to catch stray tokens.
        let parsedOK = true;
        try{
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(content);
        }catch(err){
          parsedOK = false;
          Terminal.log({ level: "error", source: "css", message: err.message || "CSS syntax error", filename: fname, stack: err.stack || "" });
        }
        // Manual scan for unmatched braces or stray tokens when CSSStyleSheet fails silently or partially.
        const lines = content.split(/\n/);
        let braceCount = 0;
        for(let i=0; i<lines.length; i++){
          const line = lines[i];
          for(const ch of line){
            if(ch === '{') braceCount++;
            else if(ch === '}') braceCount--;
          }
          const trimmed = line.trim();
          // Detect stray tokens outside of any rule definition (braceCount === 0)
          if(braceCount === 0 && trimmed && !trimmed.startsWith('@') && !trimmed.startsWith('/*') && !trimmed.startsWith('*/')){
            // If line does not contain a colon or brace, it's unexpected content
            if(!trimmed.includes(':') && !trimmed.includes('{') && !trimmed.includes('}')){
              Terminal.log({ level: "error", source: "css", message: `Unexpected content outside of CSS rule: '${trimmed}'`, filename: fname, lineno: i+1, colno: 1 });
            }
          }
        }
        if(braceCount !== 0){
          Terminal.log({ level: "error", source: "css", message: "Mismatched curly braces in CSS", filename: fname });
        }
      }
    }
  }

  // ----------------------------
  // Event handlers
  // ----------------------------
  editorEl.addEventListener("input", () => {
    project[openFile] = editorEl.value;
    saveProject();
    updateCursorPos();
    if(autoRun) runPreview();
  });
  editorEl.addEventListener("keyup", (e) => {
    if(e.key === "Tab"){
      const start = editorEl.selectionStart;
      const end = editorEl.selectionEnd;
      const v = editorEl.value;
      editorEl.value = v.substring(0, start) + "  " + v.substring(end);
      editorEl.selectionStart = editorEl.selectionEnd = start + 2;
      e.preventDefault();
      project[openFile] = editorEl.value;
      saveProject();
    }
    updateCursorPos();
  });
  document.addEventListener("keydown", (e) => {
    if(e.ctrlKey && e.key.toLowerCase() === "s"){ e.preventDefault(); saveCurrent(); }
    if(e.ctrlKey && e.key.toLowerCase() === "n"){ e.preventDefault(); newFile(); }
    if(e.ctrlKey && e.key === "Enter"){ e.preventDefault(); runPreview(); }
  });
  newFileBtn.addEventListener("click", newFile);
  saveFileBtn.addEventListener("click", saveCurrent);
  renameFileBtn.addEventListener("click", renameCurrent);
  deleteFileBtn.addEventListener("click", deleteCurrent);
  runBtn.addEventListener("click", () => runPreview());
  downloadBtn.addEventListener("click", downloadZip);
  resetBtn.addEventListener("click", resetProject);
  themeBtn.addEventListener("click", () => {
    const root = document.documentElement;
    const light = root.getAttribute("data-theme") === "light";
    root.setAttribute("data-theme", light ? "dark" : "light");
    localStorage.setItem("web-ide-theme", root.getAttribute("data-theme"));
  });
  autoRunEl.addEventListener("change", () => {
    autoRun = autoRunEl.checked;
    if(autoRun) runPreview();
  });
  // Removed file search functionality; creation is handled by the new input field.
  importBtn.addEventListener("click", importJSON);
  exportBtn.addEventListener("click", exportJSON);

  // Create new files/directories via sidebar input. On click, read the input
  // value, call newFile() with it, then clear the field.
  if(createItemBtn && newItemInput){
    createItemBtn.addEventListener("click", () => {
      const value = newItemInput.value.trim();
      if(value){
        newFile(value);
        // Clear input after creation for convenience
        newItemInput.value = "";
      }
    });
    // Allow pressing Enter in the input to create the item
    newItemInput.addEventListener("keydown", (e) => {
      if(e.key === "Enter"){
        e.preventDefault();
        createItemBtn.click();
      }
    });
  }

  // Pane toggle
  function setPane(which){
    const iframe = $("#previewFrame");
    const term = $("#terminalPane");
    const btnPrev = paneBtnPreview;
    const btnTerm = paneBtnTerminal;
    if(which === "terminal"){
      iframe?.classList.remove("active");
      term?.classList.add("active");
      btnTerm?.setAttribute("aria-selected","true");
      btnPrev?.setAttribute("aria-selected","false");
      localStorage.setItem("web-ide-pane","terminal");
    }else{
      term?.classList.remove("active");
      iframe?.classList.add("active");
      btnPrev?.setAttribute("aria-selected","true");
      btnTerm?.setAttribute("aria-selected","false");
      localStorage.setItem("web-ide-pane","preview");
      if(autoRun) runPreview();
    }
  }
  paneBtnPreview?.addEventListener("click", () => setPane("preview"));
  paneBtnTerminal?.addEventListener("click", () => setPane("terminal"));

  // Terminal actions
  terminalClearBtn?.addEventListener("click", () => {
    Terminal.clear();
  });
  terminalCopyBtn?.addEventListener("click", () => {
    // Flatten terminal log entries into plain text and copy to clipboard
    const lines = Terminal.entries.map((e) => {
      const ts = e.time ? e.time.toLocaleTimeString() : '';
      const lvl = e.level || '';
      const src = e.source || '';
      const file = e.filename ? `${e.filename}${e.lineno ? ':'+e.lineno : ''}${e.colno ? ':'+e.colno : ''}` : '';
      let line = `[${ts}] ${src} ${lvl}: ${e.message}`;
      if(file) line += ` ${file}`;
      if(e.stack) line += `\n${e.stack}`;
      return line;
    });
    const text = lines.join("\n");
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).catch(() => {});
    }else{
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try{ document.execCommand('copy'); }catch(e){}
      document.body.removeChild(textarea);
    }
  });

  // Batch creation modal event handlers
  // Open the modal when the toolbar button is clicked
  if(batchCreateBtn && treeModal && treeInput){
    batchCreateBtn.addEventListener("click", () => {
      // Clear any previous input and show the modal
      treeInput.value = "";
      treeModal.classList.remove("hidden");
    });
  }
  // Cancel button hides the modal without making changes
  if(treeCancelBtn && treeModal){
    treeCancelBtn.addEventListener("click", () => {
      treeModal.classList.add("hidden");
      if(treeInput) treeInput.value = "";
    });
  }
  // Generate button parses the input and creates the files/directories
  if(treeGenerateBtn && treeModal){
    treeGenerateBtn.addEventListener("click", () => {
      const val = treeInput ? treeInput.value : "";
      if(val && val.trim().length > 0){
        createFromTree(val);
      }
      treeModal.classList.add("hidden");
      if(treeInput) treeInput.value = "";
    });
  }

  // Receive runtime errors from the preview iframe
  window.addEventListener("message", (ev) => {
    const data = ev.data;
    if(!data || !data.__WEB_IDE_ERROR) return;
    const p = data.payload || {};
    const lvl = (data.__WEB_IDE_ERROR === "error" || data.__WEB_IDE_ERROR === "console.error") ? "error"
              : (data.__WEB_IDE_ERROR === "console.warn" || data.__WEB_IDE_ERROR === "unhandledrejection") ? "warn"
              : "info";
    Terminal.log({
      level: lvl,
      source: "iframe",
      message: p.message || String(data.__WEB_IDE_ERROR),
      filename: p.filename || "",
      lineno: p.lineno || 0,
      colno: p.colno || 0,
      stack: p.stack || ""
    });
  });

  // ----------------------------
  // Boot
  // ----------------------------
  function boot(){
    loadProject();
    const theme = localStorage.getItem("web-ide-theme") || "dark";
    document.documentElement.setAttribute("data-theme", theme);
    renderTabs();
    renderFileList();
    renderEditor();
    // Initialize terminal and provide click handler for navigating to errors
    Terminal.init({
      listElement: terminalListEl,
      autoScrollElement: terminalAutoScrollEl,
      entryClickHandler: (entry) => {
        if(entry && entry.filename && project[entry.filename]){
          open(entry.filename);
          // set cursor to the error line/col
          setTimeout(() => {
            const lines = editorEl.value.split("\n");
            let pos = 0;
            if(entry.lineno && entry.lineno > 0){
              for(let i=0;i<entry.lineno-1;i++) pos += lines[i].length + 1;
              pos += Math.max((entry.colno || 1) - 1, 0);
            }
            editorEl.focus();
            editorEl.setSelectionRange(pos, pos);
            updateCursorPos();
          }, 0);
        }
      }
    });
    // Restore last viewed pane (preview or terminal)
    const lastPane = localStorage.getItem('web-ide-pane') || 'preview';
    setPane(lastPane);
    if(lastPane === 'preview') runPreview();
  }
  boot();
})();