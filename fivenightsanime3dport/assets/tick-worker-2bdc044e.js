(function () {
  "use strict";
  let e;
  self.addEventListener("message", (t) => {
    switch (t.data) {
      case "run":
        if (e) return;
        e = setInterval(() => {
          postMessage("tick");
        }, 16);
        break;
      case "stop":
        (clearInterval(e), (e = void 0));
        break;
      default:
        t.data;
    }
  });
})();
