// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: wifi;
let result = await (async () => {
  try {
    // Decide download size
    let downloadBytes = args.shortcutParameter ? 1_000_000 : 250_000;
    let req = new Request(`https://speed.cloudflare.com/__down?bytes=${downloadBytes}`);

    // Download speed
    let start = Date.now();
    await req.load();
    let end = Date.now();
    let downloadMB = downloadBytes / (1024 * 1024); // Convert bytes to MB
    let durationSec = (end - start) / 1000;
    let downloadMbps = (downloadMB * 8) / durationSec; // MB to Mb

    // Ping
    let pingReq = new Request("https://1.1.1.1/cdn-cgi/trace");
    let pingStart = Date.now();
    await pingReq.loadString();
    let pingEnd = Date.now();
    let pingMs = pingEnd - pingStart;

    return `⌛️ Download: ${downloadMbps.toFixed(2)} Mbps
🏓 Ping: ${pingMs} ms`;
  } catch (err) {
    return `⌛️ Download: N/A
🏓 Ping: N/A`; 
  }
})();

Script.setShortcutOutput(result);
Script.complete();