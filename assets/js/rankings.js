// rankings.js: the cup dropdown on the rankings pages. Choosing a cup opens that ranking's
// page (each ranking is its own page, made by _plugins/rankings_pages.rb).

(function () {
  "use strict";

  var picker = document.querySelector("[data-ranking-picker]");
  if (!picker) return;
  var select = picker.querySelector("select");

  select.addEventListener("change", function () {
    if (select.value) window.location.href = select.value;
  });

  // After the Back button, the browser may restore the page with the dropdown still showing
  // the cup that was just chosen. Put it back on this page's own ranking.
  window.addEventListener("pageshow", function () {
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].defaultSelected) { select.selectedIndex = i; break; }
    }
  });

  // The form has no submit button; Enter in the dropdown shouldn't reload the page.
  picker.addEventListener("submit", function (e) { e.preventDefault(); });
})();
