// tabs.js: the Team Finder's two tabs (Contenders, Find teams) on /team-finder/.
//
// - Markup: [data-tabs] holds a [role=tablist] of buttons (role=tab, data-tab="<name>",
//   aria-controls = its panel's id) and the panels (role=tabpanel). Without JavaScript the first
//   panel shows; the page needs JavaScript anyway.
// - The address's #fragment picks the tab (/team-finder/#find), so a tab can be linked to and the
//   Back button works between tabs. Without one, the tab last used in this browser shows.
// - Arrow keys, Home and End move between tabs (the usual keyboard pattern for tabs).
// - Showing a tab fires "tf:tab" on document, with detail = the tab's name.

(function () {
  "use strict";

  var box = document.querySelector("[data-tabs]");
  if (!box) return;
  var tabs = Array.prototype.slice.call(box.querySelectorAll('[role="tab"]'));
  if (!tabs.length) return;
  var STORE = "team-finder-tab";

  function named(name) {
    return tabs.find(function (t) { return t.getAttribute("data-tab") === name; }) || null;
  }

  function show(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
    var name = tab.getAttribute("data-tab");
    try { localStorage.setItem(STORE, name); } catch (e) { /* storage blocked */ }
    document.dispatchEvent(new CustomEvent("tf:tab", { detail: name }));
  }

  // Clicking a tab adds a history entry, so Back returns to the other tab
  function choose(tab) {
    var name = tab.getAttribute("data-tab");
    if (location.hash !== "#" + name) history.pushState(null, "", "#" + name);
    show(tab, true);
  }

  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { choose(t); });
    t.addEventListener("keydown", function (e) {
      var to = null;
      if (e.key === "ArrowRight") to = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") to = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") to = tabs[0];
      else if (e.key === "End") to = tabs[tabs.length - 1];
      if (!to) return;
      e.preventDefault();
      choose(to);
    });
  });

  function fromAddress() {
    var tab = named(location.hash.slice(1));
    if (!tab) {
      var saved = null;
      try { saved = localStorage.getItem(STORE); } catch (e) { saved = null; }
      tab = named(saved) || tabs[0];
    }
    show(tab, false);
  }
  window.addEventListener("popstate", fromAddress);
  window.addEventListener("hashchange", fromAddress);
  fromAddress();
})();
