// theme.js: the Light/Dark toggle shared by the game projects.
//
// SHARED FILE. Every project holds an identical copy. Change STYLE-GUIDE.md (master in
// Google Drive, "GH-Projects") first, then copy this file into every repo.
//
// Load it in <head>, WITHOUT defer or async, so the theme is set before the page is drawn
// (otherwise the page flashes the wrong colors on load):
//   <script src="/assets/js/theme.js"></script>
//
// - First visit: follows the system setting (and keeps following it if that changes).
// - After a click on the toggle: stays on the chosen theme. The choice is saved in this
//   browser for this address only, so each project remembers its own.
// - Any element with data-theme-toggle becomes the toggle button.

(function () {
  "use strict";

  var KEY = "theme";
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function saved() {
    try {
      var t = localStorage.getItem(KEY);
      return t === "light" || t === "dark" ? t : null;
    } catch (e) {
      return null;
    }
  }

  function system() {
    return media && media.matches ? "dark" : "light";
  }

  function current() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function render() {
    var dark = current() === "dark";
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      b.textContent = dark ? "☀ Light" : "☾ Dark";
      b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      b.title = b.getAttribute("aria-label");
      b.hidden = false;
    }
  }

  function set(theme, remember) {
    root.setAttribute("data-theme", theme);
    if (remember) {
      try { localStorage.setItem(KEY, theme); } catch (e) { /* storage blocked: still switches */ }
    }
    render();
  }

  // Runs immediately, before the page is drawn.
  set(saved() || system(), false);

  if (media) {
    var follow = function () { if (!saved()) set(system(), false); };
    if (media.addEventListener) media.addEventListener("change", follow);
    else if (media.addListener) media.addListener(follow);
  }

  document.addEventListener("click", function (e) {
    var target = e.target.closest ? e.target.closest("[data-theme-toggle]") : null;
    if (target) set(current() === "dark" ? "light" : "dark", true);
  });

  document.addEventListener("DOMContentLoaded", render);
})();
