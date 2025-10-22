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
    // The IDE no longer ships with a starter project. This object
    // remains for backwards compatibility but is intentionally empty.
    // When no project is found in localStorage, the IDE will start
    // with an empty file tree and no preset files.
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
  // Currently open file in the editor (empty when no file is selected)
  let openFile = "";
  /** Whether auto-run preview is enabled. */
  let autoRun = true;

  /**
   * Load project from localStorage or fall back to starter files.
   */
  function loadProject(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        project = JSON.parse(raw);
      } catch {
        project = {};
      }
    } else {
      project = {};
    }
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
  const searchFilesEl = $("#searchFiles");
  const importBtn = $("#importBtn");
  const exportBtn = $("#exportBtn");

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
    const files = Object.keys(project).sort();
    fileListEl.innerHTML = "";
    for(const f of files){
      if(filter && !f.toLowerCase().includes(filter.toLowerCase())) continue;
      const li = document.createElement("li");
      li.setAttribute("role","treeitem");
      li.dataset.file = f;
      li.className = f === openFile ? "active" : "";
      const isDir = f.endsWith("/");
      const badge = isDir ? "dir" : `${(project[f] || "").length} ch`;
      li.innerHTML = `<span>${f}</span><span class="file-badge">${badge}</span>`;
      // Only attach click handler for files
      if(!isDir){
        li.addEventListener("click", () => open(f));
      }
      fileListEl.append(li);
    }
  }
  /**
   * Render the tab bar for open files.
   */
  function renderTabs(){
    tabbarEl.innerHTML = "";
    for(const f of Object.keys(project).sort()){
      // Do not create tabs for directories
      if(f.endsWith("/")) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role","tab");
      btn.textContent = f;
      if(f === openFile) btn.classList.add("active");
      btn.addEventListener("click", () => open(f));
      tabbarEl.append(btn);
    }
  }
  /**
   * Render the editor contents for the currently open file.
   */
  function renderEditor(){
    if(openFile && !openFile.endsWith("/")){
      editorEl.value = project[openFile] ?? "";
      editorEl.removeAttribute("readonly");
    }else{
      editorEl.value = "";
      editorEl.setAttribute("readonly","readonly");
    }
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
    // Do not open directories in the editor
    if(fname.endsWith("/")){
      return;
    }
    openFile = fname;
    renderTabs();
    renderFileList(searchFilesEl.value.trim());
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
    // Determine which HTML, CSS, and JS files to include in the preview.
    // Prefer conventional names but fall back to the first file of each type.
    let html = project["index.html"] || "";
    let css  = project["style.css"]  || "";
    let js   = project["script.js"]  || "";
    if(!html){
      const altHtml = Object.keys(project).find((k) => !k.endsWith("/") && k.toLowerCase().endsWith(".html"));
      if(altHtml) html = project[altHtml] || "";
    }
    if(!css){
      const altCss = Object.keys(project).find((k) => !k.endsWith("/") && k.toLowerCase().endsWith(".css"));
      if(altCss) css = project[altCss] || "";
    }
    if(!js){
      const altJs = Object.keys(project).find((k) => !k.endsWith("/") && k.toLowerCase().endsWith(".js"));
      if(altJs) js = project[altJs] || "";
    }

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
    const scriptTag = `${bridge}\n<script id="__inline_script__">\n${js.replace(/<\//g, "<\\/")}\n<\/script>`;

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
  function newFile(){
    let name = prompt("New file name (to create a folder end with '/', e.g., src/ or about.html):");
    if(!name) return;
    name = name.trim();
    if(project[name]){
      alert("A file or folder with that name already exists.");
      return;
    }
    // Detect folder creation by trailing slash
    if(name.endsWith("/")){
      project[name] = null;
      saveProject();
      // folders cannot be opened in the editor
      renderTabs();
      renderFileList(searchFilesEl.value.trim());
      return;
    }
    let stub = "";
    if(name.toLowerCase().endsWith(".html")){
      stub = "<!doctype html>\\n<html lang=\\\"en\\\">\\n<head>\\n  <meta charset=\\\"UTF-8\\\">\\n  <meta name=\\\"viewport\\\" content=\\\"width=device-width, initial-scale=1.0\\\">\\n  <title>New Page</title>\\n</head>\\n<body>\\n  <h1>New Page</h1>\\n</body>\\n</html>";
    }else if(name.toLowerCase().endsWith(".css")){
      stub = "/* New stylesheet */\\n";
    }else if(name.toLowerCase().endsWith(".js")){
      stub = "// New script\\n";
    }
    project[name] = stub;
    saveProject();
    open(name);
  }
  /** Save the currently open file to the project and optionally run preview. */
  function saveCurrent(){
    // Only save if the open item is a file
    if(openFile && !openFile.endsWith("/")){
      project[openFile] = editorEl.value;
      saveProject();
      fileMetaEl.textContent = `Saved ${openFile} • ${new Date().toLocaleTimeString()}`;
      if(autoRun) runPreview();
      renderFileList(searchFilesEl.value.trim());
    }
  }
  /** Rename the currently open file, updating project keys accordingly. */
  function renameCurrent(){
    const newNameRaw = prompt("Rename file to:", openFile);
    if(!newNameRaw || newNameRaw === openFile) return;
    let newName = newNameRaw.trim();
    // If renaming a directory, ensure new name ends with '/'
    if(openFile.endsWith("/") && !newName.endsWith("/")){
      newName += "/";
    }
    if(project[newName]){
      alert("A file or folder with that name already exists.");
      return;
    }
    if(openFile.endsWith("/")){
      // Rename folder and its children
      const updated = {};
      const old = openFile;
      for(const k of Object.keys(project)){
        if(k === old || k.startsWith(old)){
          const suffix = k.slice(old.length);
          const newKey = newName + suffix;
          updated[newKey] = project[k];
        } else {
          updated[k] = project[k];
        }
      }
      project = updated;
      saveProject();
      openFile = newName;
      renderTabs();
      renderFileList(searchFilesEl.value.trim());
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
    if(openFile.endsWith("/")){
      // Delete directory and its contents
      const old = openFile;
      for(const key of Object.keys(project)){
        if(key === old || key.startsWith(old)){
          delete project[key];
        }
      }
      saveProject();
    }else{
      delete project[openFile];
      saveProject();
    }
    // Pick next file (skip directories) or leave blank
    const names = Object.keys(project).sort();
    const nextFile = names.find((n) => !n.endsWith("/"));
    if(nextFile){
      open(nextFile);
    }else{
      openFile = "";
      renderTabs();
      renderFileList(searchFilesEl.value.trim());
      editorEl.value = "";
      fileMetaEl.textContent = "";
    }
  }
  /** Reset the entire project back to the starter files after confirmation. */
  function resetProject(){
    if(!confirm("Reset project? This will erase your local changes.")) return;
    project = {};
    saveProject();
    openFile = "";
    renderTabs();
    renderFileList(searchFilesEl.value.trim());
    renderEditor();
    // Running preview with no files produces an empty page
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
        renderFileList(searchFilesEl.value.trim());
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
  // Preflight checks
  // ----------------------------
  /**
   * Perform quick syntax checks on HTML/JS/CSS before running the preview.
   */
  function preflightChecks(){
    // Iterate through all files in the project and perform syntax checks based on extension
    for(const fname of Object.keys(project)){
      const content = project[fname] || "";
      // Skip directories
      if(fname.endsWith("/")) continue;
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
    if(openFile && !openFile.endsWith("/")){
      project[openFile] = editorEl.value;
      saveProject();
      updateCursorPos();
      if(autoRun) runPreview();
    }
  });
  editorEl.addEventListener("keyup", (e) => {
    if(e.key === "Tab"){
      const start = editorEl.selectionStart;
      const end = editorEl.selectionEnd;
      const v = editorEl.value;
      editorEl.value = v.substring(0, start) + "  " + v.substring(end);
      editorEl.selectionStart = editorEl.selectionEnd = start + 2;
      e.preventDefault();
      if(openFile && !openFile.endsWith("/")){
        project[openFile] = editorEl.value;
        saveProject();
      }
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
  searchFilesEl.addEventListener("input", () => renderFileList(searchFilesEl.value.trim()));
  importBtn.addEventListener("click", importJSON);
  exportBtn.addEventListener("click", exportJSON);

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