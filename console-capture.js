/* Early console capture — must load before any Three.js scripts */
window.__devLogs = window.__devLogs || [];
['log', 'info', 'warn', 'error'].forEach(function(k) {
  var orig = console[k].bind(console);
  console[k] = function() {
    var args = Array.prototype.slice.call(arguments);
    window.__devLogs.push({
      type: k,
      time: new Date().toLocaleTimeString(),
      msg: args.map(function(a) { try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); } }).join(' ')
    });
    if (window.__devLogs.length > 500) window.__devLogs.shift();
    orig.apply(console, args);
  };
});
