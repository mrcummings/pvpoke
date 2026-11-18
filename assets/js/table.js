// table.js: filtering and sorting for the data tables (pokemon, moves, cups).
//
// The table is complete HTML without this script. It adds:
//   - a box that filters on all columns: every word typed must appear somewhere in the row
//   - a filter box under each column heading:
//       text      the cell contains it (not case-sensitive)
//       !text     the cell doesn't contain it
//       =text     the cell is exactly it (or, for numbers, equals it)
//       >200  >=200  <50  <=50   number comparisons
//       100..200  a number range, inclusive
//   - click a column heading to sort: ascending, then descending, then the original order.
//     Empty cells always go last.

(function () {
  "use strict";

  var table = document.querySelector("table[data-table]");
  if (!table) return;

  var thead = table.tHead;
  var tbody = table.tBodies[0];
  var headCells = Array.prototype.slice.call(thead.rows[0].cells);
  var labels = headCells.map(function (th) { return th.textContent; });
  var numericCols = headCells.map(function (th) { return th.classList.contains("num"); });
  var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  // Read every row once.
  var rows = Array.prototype.slice.call(tbody.rows).map(function (tr, i) {
    var text = Array.prototype.map.call(tr.cells, function (c) { return c.textContent; });
    return {
      el: tr,
      index: i,
      text: text,
      lower: text.map(function (s) { return s.toLowerCase(); }),
      all: text.join(" \u0001 ").toLowerCase()
    };
  });

  // ---- Controls above the table ----
  var wrap = table.closest(".table-wrap") || table.parentNode;
  var controls = document.createElement("div");
  controls.className = "table-controls";
  controls.innerHTML =
    '<input type="search" placeholder="Filter all columns" aria-label="Filter all columns">' +
    '<button type="button">Clear filters</button>' +
    '<span class="count" aria-live="polite"></span>' +
    '<p class="help">Click a heading to sort. Column filters accept text, <code>!text</code> (doesn’t contain), ' +
    '<code>=text</code> (exactly), and for numbers <code>&gt;200</code>, <code>&lt;=50</code> or <code>100..200</code>.</p>';
  wrap.parentNode.insertBefore(controls, wrap);
  var globalBox = controls.querySelector("input");
  var clearBtn = controls.querySelector("button");
  var countEl = controls.querySelector(".count");

  // ---- Filter row under the headings ----
  var filterRow = document.createElement("tr");
  filterRow.className = "filters";
  var colBoxes = labels.map(function (label, i) {
    var cell = document.createElement(i === 0 ? "th" : "td");
    var input = document.createElement("input");
    input.type = "search";
    input.setAttribute("aria-label", "Filter " + label);
    input.placeholder = numericCols[i] ? ">, <, a..b" : "filter";
    cell.appendChild(input);
    filterRow.appendChild(cell);
    return input;
  });
  thead.appendChild(filterRow);

  // ---- Sort buttons in the headings ----
  var sortCol = -1;
  var sortDir = 0; // 1 ascending, -1 descending, 0 original order
  headCells.forEach(function (th, i) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sort";
    btn.textContent = labels[i];
    th.textContent = "";
    th.appendChild(btn);
    btn.addEventListener("click", function () {
      if (sortCol !== i) { sortCol = i; sortDir = 1; }
      else if (sortDir === 1) { sortDir = -1; }
      else if (sortDir === -1) { sortDir = 0; }
      else { sortDir = 1; }
      headCells.forEach(function (h) { h.removeAttribute("aria-sort"); });
      if (sortDir) th.setAttribute("aria-sort", sortDir === 1 ? "ascending" : "descending");
      sort();
      apply();
    });
  });

  function sort() {
    var c = sortCol;
    var ordered = rows.slice();
    if (sortDir && c >= 0) {
      ordered.sort(function (a, b) {
        var x = a.text[c], y = b.text[c];
        if (x === "" || y === "") {
          if (x === y) return a.index - b.index;
          return x === "" ? 1 : -1; // empty last, in both directions
        }
        var r = numericCols[c] ? Number(x) - Number(y) : collator.compare(x, y);
        return (r * sortDir) || (a.index - b.index);
      });
    }
    var frag = document.createDocumentFragment();
    ordered.forEach(function (r) { frag.appendChild(r.el); });
    tbody.appendChild(frag);
  }

  // ---- Filtering ----
  var NUM = "(-?\\d+(?:\\.\\d+)?)";
  var CMP = new RegExp("^(<=|>=|<|>)\\s*" + NUM + "$");
  var RANGE = new RegExp("^" + NUM + "\\s*\\.\\.\\s*" + NUM + "$");

  // Turns one filter box's text into a test for a cell's text (null = no filter).
  function compile(raw) {
    var q = raw.trim().toLowerCase();
    if (!q) return null;
    var m = q.match(CMP);
    if (m) {
      var n = Number(m[2]), op = m[1];
      return function (s) {
        if (s === "" || isNaN(Number(s))) return false;
        var v = Number(s);
        return op === "<" ? v < n : op === ">" ? v > n : op === "<=" ? v <= n : v >= n;
      };
    }
    m = q.match(RANGE);
    if (m) {
      var lo = Math.min(Number(m[1]), Number(m[2])), hi = Math.max(Number(m[1]), Number(m[2]));
      return function (s) {
        if (s === "" || isNaN(Number(s))) return false;
        var v = Number(s);
        return v >= lo && v <= hi;
      };
    }
    if (q.charAt(0) === "=") {
      var exact = q.slice(1).trim();
      return function (s) {
        return s === exact || (exact !== "" && s !== "" && !isNaN(Number(exact)) && Number(s) === Number(exact));
      };
    }
    if (q.charAt(0) === "!") {
      var not = q.slice(1).trim();
      return not ? function (s) { return s.indexOf(not) === -1; } : null;
    }
    return function (s) { return s.indexOf(q) !== -1; };
  }

  function apply() {
    var words = globalBox.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var tests = colBoxes.map(function (b) { return compile(b.value); });
    var shown = 0;
    // Walk rows in their current (sorted) order so the stripes alternate correctly.
    Array.prototype.forEach.call(tbody.rows, function (tr) {
      var r = tr._row;
      var ok = words.every(function (w) { return r.all.indexOf(w) !== -1; }) &&
        tests.every(function (t, i) { return !t || t(r.lower[i]); });
      tr.hidden = !ok;
      if (ok) {
        tr.classList.toggle("alt", shown % 2 === 1);
        shown++;
      }
    });
    countEl.textContent = shown === rows.length
      ? rows.length + " rows"
      : "Showing " + shown + " of " + rows.length + " rows";
  }

  rows.forEach(function (r) { r.el._row = r; });

  var timer = null;
  function later() {
    clearTimeout(timer);
    timer = setTimeout(apply, 120);
  }
  globalBox.addEventListener("input", later);
  colBoxes.forEach(function (b) { b.addEventListener("input", later); });

  clearBtn.addEventListener("click", function () {
    globalBox.value = "";
    colBoxes.forEach(function (b) { b.value = ""; });
    apply();
  });

  table.classList.add("js");
  apply();
})();
