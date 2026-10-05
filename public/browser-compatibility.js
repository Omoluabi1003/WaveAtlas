/* Keep this bootstrap in ES5 so embedded Android browsers can run it. */
(function () {
  var ua = navigator.userAgent || "";
  var chrome = /(?:Chrome|Chromium)\/(\d+)/.exec(ua);
  var firefox = /Firefox\/(\d+)/.exec(ua);
  var oldAndroid = /Android/i.test(ua) && (chrome ? parseInt(chrome[1], 10) < 111 : firefox ? parseInt(firefox[1], 10) < 111 : /Version\/[1-4]\./.test(ua));
  var fullRequested = /(?:\?|&)full=1(?:&|$)/.test(location.search);
  if (oldAndroid && !fullRequested) {
    var station = /(?:\?|&)station=([^&]+)/.exec(location.search);
    var pathStation = /^\/station\/([a-zA-Z0-9-]+)\/?$/.exec(location.pathname);
    location.replace("/listen" + (station ? "?station=" + station[1] : pathStation ? "?station=" + encodeURIComponent(pathStation[1]) : ""));
  }
}());
