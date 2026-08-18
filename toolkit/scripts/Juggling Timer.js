// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: futbol;
let wv = new WebView()
let html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=0">
<style>
  :root { 
    --bg-color: #0d0e15;
    --blob1: #6366f1;
    --blob2: #a855f7;
    --blob3: #ec4899;
    --text-main: #ffffff;
    --text-sub: rgba(255, 255, 255, 0.7);
    --glass-bg: rgba(255, 255, 255, 0.05);
    --glass-border: rgba(255, 255, 255, 0.1);
    --glass-shadow: rgba(0, 0, 0, 0.3);
  }
  
  .done-theme { 
    --bg-color: #1a1500;
    --blob1: #fbbf24;
    --blob2: #f59e0b;
    --blob3: #d97706;
    --text-main: #ffffff;
    --text-sub: rgba(255, 255, 255, 0.9);
    --glass-bg: rgba(255, 215, 0, 0.15);
    --glass-border: rgba(255, 215, 0, 0.4);
    --glass-shadow: rgba(255, 215, 0, 0.2);
  }
  
  body {
    margin: 0; 
    height: 100vh;
    background-color: var(--bg-color);
    color: var(--text-main);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
    user-select: none; 
    -webkit-user-select: none;
    overflow: hidden;
    transition: background-color 0.8s ease;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  
  /* Animated Ambient Blobs */
  .blobs {
    position: absolute;
    width: 100vw;
    height: 100vh;
    top: 0;
    left: 0;
    z-index: -1;
    overflow: hidden;
    filter: blur(60px);
    -webkit-filter: blur(60px);
  }
  
  .blob {
    position: absolute;
    border-radius: 50%;
    animation: move 12s infinite alternate cubic-bezier(0.4, 0, 0.2, 1);
    opacity: 0.6;
    transition: background 0.8s ease;
  }
  
  .blob:nth-child(1) {
    width: 300px; height: 300px;
    background: var(--blob1);
    top: -50px; left: -50px;
    animation-delay: 0s;
  }
  
  .blob:nth-child(2) {
    width: 350px; height: 350px;
    background: var(--blob2);
    bottom: -100px; right: -50px;
    animation-delay: -4s;
  }
  
  .blob:nth-child(3) {
    width: 250px; height: 250px;
    background: var(--blob3);
    top: 40%; left: 40%;
    animation-delay: -8s;
  }
  
  @keyframes move {
    0% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(50px, 80px) scale(1.1); }
    100% { transform: translate(-80px, 40px) scale(0.9); }
  }
  
  /* Glassmorphism Card for Absolute Centering */
  .wrapper {
    text-align: center;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    padding: 3rem 4rem;
    border-radius: 2rem;
    box-shadow: 0 8px 32px var(--glass-shadow);
    /* Accounts for iOS status/nav bar vertical weight */
    transform: translateY(-5vh);
    transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.8s, border 0.8s;
  }
  
  body:active .wrapper { 
    transform: translateY(-5vh) scale(0.95); 
  } 
  
  .label {
    font-size: 0.9rem; 
    font-weight: 700; 
    letter-spacing: 0.25em;
    color: var(--text-sub); 
    text-transform: uppercase; 
    margin-bottom: -10px;
    transition: color 0.8s;
  }
  
  #time {
    font-size: 9rem; 
    font-weight: 200; 
    letter-spacing: -4px;
    font-variant-numeric: tabular-nums; 
    margin: 0; 
    line-height: 1.2;
    text-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
  }
  
  .hint {
    font-size: 0.75rem; 
    font-weight: 500; 
    color: var(--text-sub);
    letter-spacing: 0.15em; 
    margin-top: 10px;
    text-transform: uppercase;
    transition: color 0.8s;
  }
</style>
</head>
<body onclick="reset()">
  <div class="blobs">
    <div class="blob"></div>
    <div class="blob"></div>
    <div class="blob"></div>
  </div>
  <div class="wrapper">
    <div class="label">Juggling Timer</div>
    <div id="time">60</div>
    <div class="hint">Tap anywhere to restart</div>
  </div>
  <script>
    let t = 60, timer;
    const timeEl = document.getElementById('time');
    
    const start = () => {
      clearInterval(timer);
      timer = setInterval(() => {
        t--;
        timeEl.innerText = t;
        if(t <= 0) {
          clearInterval(timer);
          document.body.classList.add('done-theme');
        }
      }, 1000);
    };
    
    const reset = () => {
      t = 60;
      timeEl.innerText = t;
      document.body.classList.remove('done-theme');
      start();
    };
    
    start();
  </script>
</body>
</html>
`
wv.loadHTML(html)
await wv.present(true)
