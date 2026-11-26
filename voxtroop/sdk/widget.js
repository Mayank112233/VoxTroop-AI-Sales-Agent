(() => {
  const script = document.currentScript;
  const origin = new URL(script.src).origin;
  const business = script.dataset.business;
  if (!business) return;
  const button = document.createElement("button");
  button.textContent = "Chat with us";
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  const frame = document.createElement("iframe");
  frame.title = "VoxTroop assistant";
  frame.allow = "microphone " + origin;
  frame.hidden = true;
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;z-index:2147483000;right:20px;bottom:20px;display:grid;gap:12px;justify-items:end";
  button.style.cssText = "padding:12px 18px;border:0;border-radius:99px;color:#fff;background:#17654c;cursor:pointer;font:600 14px system-ui";
  frame.style.cssText = "width:min(360px,calc(100vw - 40px));height:min(480px,calc(100vh - 100px));border:1px solid #ced9d4;border-radius:16px;background:white";
  if (business === "edunext") {
    container.style.right = "12px";
    container.style.bottom = "12px";
    button.style.background = "#2457df";
    frame.style.cssText = "display:block;width:min(440px,calc(100vw - 24px));height:min(680px,calc(100dvh - 84px));border:1px solid #424955;border-radius:18px;background:#191b1f;box-shadow:0 14px 45px #0006";
    frame.style.display = "none";
  }
  button.onclick = () => {
    if (!frame.src) frame.src = origin + "/widget/" + encodeURIComponent(business);
    frame.hidden = !frame.hidden;
    if (business === "edunext") frame.style.display = frame.hidden ? "none" : "block";
    button.setAttribute("aria-expanded", String(!frame.hidden));
    button.textContent = frame.hidden ? "Chat with us" : "Close chat";
  };
  container.append(frame, button);
  document.body.append(container);
})();
