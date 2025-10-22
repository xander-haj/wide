// /terminal.js
/* global document */
/**
 * A simple terminal logger that collects entries and renders them into a list.
 * The terminal is decoupled from the main app so that its state and UI
 * interactions are encapsulated. To use, call `Terminal.init` with the
 * appropriate DOM elements and an optional click handler for entries. Use
 * `Terminal.log()` to append new entries and `Terminal.clear()` to reset.
 */
(function(){
  'use strict';
  // Internal storage of log entries
  const _entries = [];
  /**
   * The list element where log entries will be rendered.
   * @type {HTMLElement|null}
   */
  let listEl = null;
  /**
   * Checkbox controlling automatic scroll behavior. When checked the list
   * automatically scrolls to the bottom on new entries.
   * @type {HTMLInputElement|null}
   */
  let autoScrollEl = null;
  /**
   * Optional click handler invoked when a log row is clicked. Receives the
   * entry object associated with the row.
   * @type {Function|null}
   */
  let entryClickHandler = null;

  /**
   * Format a Date into a human readable time string.
   * @param {Date} d
   * @returns {string}
   */
  function fmtTime(d = new Date()){ return d.toLocaleTimeString(); }

  /**
   * Render all log entries into the associated list element. Each row is
   * decorated with classes based on the log level and stores metadata on
   * the dataset for click handlers.
   */
  function render(){
    if(!listEl) return;
    listEl.innerHTML = '';
    for(const e of _entries){
      const li = document.createElement('li');
      li.className = 'term-row';
      // Determine level class for styling
      const kindClass = e.level === 'error' ? 'term-err' : e.level === 'warn' ? 'term-warn' : 'term-info';
      const file = e.filename ? `<span class="term-file">${e.filename}</span>` : '';
      const linecol = (e.lineno || e.colno) ? `:${e.lineno ?? ''}:${e.colno ?? ''}` : '';
      const stack = e.stack ? `\n<span class="term-stack">${String(e.stack).replaceAll('<','&lt;').replaceAll('>','&gt;')}</span>` : '';
      li.innerHTML = `<span class="term-time">[${fmtTime(e.time)}]</span><span class="term-src">${e.source}</span><span class="${kindClass}">${e.message}</span> ${file}${linecol}${stack}`;
      // Attach metadata to element for click handling
      li.dataset.filename = e.filename || '';
      li.dataset.lineno   = e.lineno  ? String(e.lineno) : '';
      li.dataset.colno    = e.colno   ? String(e.colno) : '';
      if(entryClickHandler){
        li.addEventListener('click', () => entryClickHandler(e));
      }
      listEl.append(li);
    }
    if(autoScrollEl?.checked){ listEl.scrollTop = listEl.scrollHeight; }
  }
  /**
   * Append a new log entry and re-render the list.
   * @param {Object} entry
   */
  function log(entry){
    _entries.push({
      time: new Date(),
      level: entry.level || 'error',
      source: entry.source || 'runtime',
      message: String(entry.message || ''),
      filename: entry.filename || '',
      lineno: entry.lineno || 0,
      colno: entry.colno || 0,
      stack: entry.stack || ''
    });
    render();
  }
  /**
   * Clear all log entries and re-render.
   */
  function clear(){
    _entries.length = 0;
    render();
  }
  /**
   * Initialise the terminal by providing DOM elements and optional click
   * handler. If called multiple times, updates the internal references.
   * @param {Object} opts
   * @param {HTMLElement} opts.listElement The UL element to render into
   * @param {HTMLInputElement} opts.autoScrollElement The checkbox controlling auto-scroll
   * @param {Function} [opts.entryClickHandler] Optional handler invoked on row click
   */
  function init(opts){
    listEl = opts.listElement;
    autoScrollEl = opts.autoScrollElement;
    entryClickHandler = opts.entryClickHandler || null;
    render();
  }
  // Expose API on global
  window.Terminal = {
    init,
    log,
    clear,
    entries: _entries
  };
})();