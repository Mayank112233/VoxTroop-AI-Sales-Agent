const form = document.querySelector("form");
const input = form.querySelector("input");
const messages = document.querySelector("#messages");
const actions = document.querySelector("#appointment");
const recordButton = document.querySelector("#record");
const playButton = document.querySelector("#play");
const business = location.pathname.split("/").pop();
const path = "/widget/" + business;
const academy = business === "edunext";

if (academy) {
  document.body.dataset.business = business;
  const avatar = document.querySelector("#academy-avatar");
  document.querySelector("header").prepend(avatar.content.cloneNode(true));
  const starters = document.querySelector("#academy-starters");
  starters.hidden = false;
  for (const button of starters.querySelectorAll("button")) {
    button.onclick = () => {
      input.value = button.dataset.prompt;
      input.focus();
    };
  }
  input.placeholder = "Ask about your future…";
  const send = document.querySelector("#send");
  send.textContent = "↑";
  form.append(send);
}
let token;
let reply;
let recorder;
let timer;
let busy = false;
let hindi = false;
let timezone = "UTC";
let appointmentLabel = "Appointment";
let appointmentLabelHi = "अपॉइंटमेंट";
const local = (english, translated) => hindi ? translated : english;

function formatReply(parent, value) {
  let list;
  for (const line of value.replace(/\\r\\n|\\n/g, "\n").split("\n")) {
    if (!line.trim()) {
      list = undefined;
      continue;
    }
    const mark = /^\s*(\d+[.)]|[-*•])\s+/.exec(line);
    const heading = /^#{1,6}\s+/.test(line);
    const tag = mark && /^\d/.test(mark[1]) ? "OL" : "UL";
    let row;
    if (mark) {
      if (list?.tagName !== tag) {
        list = document.createElement(tag.toLowerCase());
        parent.append(list);
      }
      row = document.createElement("li");
      list.append(row);
    } else {
      list = undefined;
      row = document.createElement("p");
      parent.append(row);
    }
    const content = mark ? line.slice(mark[0].length) : line.replace(/^#{1,6}\s+/, "");
    for (const [index, text] of content.split(/\*\*([^*]+)\*\*/).entries()) {
      if (!text) continue;
      if (heading || index % 2) {
        const bold = document.createElement("strong");
        bold.textContent = text;
        row.append(bold);
      } else row.append(document.createTextNode(text));
    }
  }
}

function append(label, value, products = [], followUp = "") {
  const node = document.createElement(label === "Assistant" ? "div" : "p");
  if (label === "Assistant") node.classList.add("assistant-reply");
  if (!academy && label !== "Assistant") {
    node.textContent = label + ": " + value;
  } else {
    node.classList.add("message-" + label.toLowerCase());
    if (academy && label === "Assistant") {
      node.append(document.querySelector("#academy-avatar").content.cloneNode(true));
    }
    const speaker = document.createElement("span");
    if (academy) speaker.className = "sr-only";
    speaker.textContent = label + ": ";
    const copy = document.createElement(label === "Assistant" ? "div" : "span");
    copy.className = "message-copy";
    if (label === "Assistant") {
      formatReply(copy, value);
      if (products.length) {
        const list = document.createElement("ol");
        list.className = "reply-products";
        for (const product of products) {
          const item = document.createElement("li");
          const name = document.createElement("strong");
          name.textContent = product.name;
          item.append(name);
          if (product.reason) item.append(" — " + product.reason);
          if (product.url) {
            const url = new URL(product.url);
            if (url.protocol === "https:" || url.protocol === "http:" &&
                ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
              const link = document.createElement("a");
              link.href = url.href;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = product.name;
              name.replaceChildren(link);
            }
          }
          list.append(item);
        }
        copy.append(list);
      }
      if (followUp) {
        const follow = document.createElement("div");
        follow.className = "reply-follow-up";
        formatReply(follow, followUp);
        copy.append(follow);
      }
    } else copy.textContent = value;
    node.append(speaker, copy);
  }
  messages.insertBefore(node, actions);
  if (!academy || label !== "Assistant" || reply) messages.scrollTop = messages.scrollHeight;
}

async function post(endpoint, data) {
  if (!token) {
    const response = await fetch(path + "/session", {
      method: "POST", headers: {"Content-Type": "application/json"},
    });
    if (!response.ok) throw new Error("Assistant is unavailable.");
    token = (await response.json()).token;
  }
  const headers = {"Authorization": "Bearer " + token};
  const file = data instanceof FormData;
  if (!file) headers["Content-Type"] = "application/json";
  const response = await fetch(path + endpoint, {
    method: "POST", headers, body: file ? data : JSON.stringify(data),
  });
  if (response.status === 401) {
    token = undefined;
    actions.replaceChildren();
    throw new Error(local("Session expired. Send a new message to continue.", "सत्र समाप्त हुआ। जारी रखने के लिए नया संदेश भेजें।"));
  }
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const detail = failure.detail;
    const error = new Error(typeof detail === "string" ? detail : detail?.message || "Could not complete the request.");
    error.slots = detail?.slots;
    throw error;
  }
  return response.headers.get("content-type").startsWith("audio/") ? response.blob() : response.json();
}

async function run(task) {
  if (busy) return;
  busy = true;
  form.setAttribute("aria-busy", "true");
  try {
    await task();
  } catch (error) {
    append("Status", error.message);
  } finally {
    busy = false;
    form.removeAttribute("aria-busy");
  }
}

function bookingText(tag, value) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function bookingButton(label, task, secondary = false) {
  const button = bookingText("button", label);
  button.type = "button";
  if (secondary) button.dataset.secondary = "";
  button.onclick = () => run(async () => {
    const panel = [...actions.querySelectorAll("button")];
    panel.forEach(control => { control.disabled = true; });
    try {
      await task();
    } catch (error) {
      if (Array.isArray(error.slots)) {
        showSlots(error.slots, local("That time is no longer available.", "वह समय अब उपलब्ध नहीं है।"));
      } else if (actions.childElementCount) {
        actions.querySelector("[data-booking-error]")?.remove();
        const note = bookingText("p", error instanceof TypeError
          ? local("Connection lost. Please try again.", "कनेक्शन टूट गया। फिर कोशिश करें।") : error.message);
        note.dataset.bookingError = "";
        note.setAttribute("role", "alert");
        actions.append(note);
        messages.scrollTop = messages.scrollHeight;
      } else throw error;
    } finally {
      panel.forEach(control => { control.disabled = false; });
    }
  });
  return button;
}

function cancelBooking() {
  return bookingButton(local("Cancel", "रद्द करें"), async () => {
    await post("/appointment/cancel", {});
    actions.replaceChildren();
    append(local("Appointment", "अपॉइंटमेंट"), local("Request cancelled.", "अनुरोध रद्द कर दिया गया।"));
    input.focus();
  }, true);
}

function displayTime(slot) {
  return new Intl.DateTimeFormat(hindi ? "hi-IN" : "en-IN", {
    weekday:"short", day:"numeric", month:"short", year:"numeric",
    hour:"numeric", minute:"2-digit", timeZone:timezone, timeZoneName:"short",
  }).format(new Date(slot));
}

function sessionType() {
  return hindi ? appointmentLabelHi : appointmentLabel;
}

function showSlots(slots, notice = "") {
  actions.replaceChildren(bookingText("h2", sessionType()));
  if (notice) actions.append(bookingText("p", notice));
  if (!slots.length) {
    actions.append(bookingText("p", local("No times are currently available.", "अभी कोई समय उपलब्ध नहीं है।")), cancelBooking());
  } else {
    actions.append(bookingText("p", local("Choose a date and time", "तारीख और समय चुनें")));
    const controls = document.createElement("div");
    controls.className = "booking-buttons";
    for (const slot of slots) {
      controls.append(bookingButton(displayTime(slot), async () => {
        const selected = await post("/appointment/propose", {slot});
        reviewBooking(selected, slots);
      }));
    }
    controls.append(cancelBooking());
    actions.append(controls);
  }
  messages.scrollTop = messages.scrollHeight;
}

function reviewBooking(selected, slots) {
  actions.replaceChildren(bookingText("h2", local("Review your appointment", "अपॉइंटमेंट की समीक्षा करें")),
    bookingText("p", sessionType() + " · " + displayTime(selected.slot)));
  const fields = [
    {key:"name", label:local("Name", "नाम"), type:"text", autocomplete:"name", max:120},
    {key:"email", label:local("Email", "ईमेल"), type:"email", autocomplete:"email", max:254},
  ];
  const fieldsByKey = {};
  for (const field of fields) {
    if (selected[field.key]) {
      actions.append(bookingText("p", field.label + " · " + selected[field.key]));
      continue;
    }
    const label = bookingText("label", field.label);
    const control = document.createElement("input");
    control.type = field.type;
    control.autocomplete = field.autocomplete;
    control.maxLength = field.max;
    control.required = true;
    label.append(control);
    actions.append(label);
    fieldsByKey[field.key] = control;
  }
  const controls = document.createElement("div");
  controls.className = "booking-buttons";
  controls.append(bookingButton(local("Confirm appointment", "अपॉइंटमेंट की पुष्टि करें"), async () => {
    const details = {slot:selected.slot};
    for (const [key, field] of Object.entries(fieldsByKey)) {
      if (!field.reportValidity()) return;
      details[key] = field.value.trim();
    }
    const result = await post("/appointment/confirm", details);
    if (!["booked", "pending_approval"].includes(result.status)) {
      throw new Error(local("The appointment could not be confirmed. Please retry.", "पुष्टि नहीं हो सकी। फिर कोशिश करें।"));
    }
    const booked = result.status === "booked";
    actions.replaceChildren(bookingText("h2", booked
      ? local("Appointment confirmed", "अपॉइंटमेंट की पुष्टि हो गई")
      : local("Awaiting staff approval", "स्टाफ की मंज़ूरी लंबित है")),
      bookingText("p", result.name + " · " + sessionType()),
      bookingText("p", displayTime(result.slot)));
    if (result.reference) actions.append(bookingText("p", local("Reference", "संदर्भ") + " · " + result.reference));
    if (!booked) actions.append(cancelBooking());
    messages.scrollTop = messages.scrollHeight;
  }), bookingButton(local("Change time", "समय बदलें"), async () => showSlots(slots), true), cancelBooking());
  actions.append(controls);
  messages.scrollTop = messages.scrollHeight;
}

form.onsubmit = (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || recorder?.state === "recording") return;
  run(async () => {
    const result = await post("/chat", {message});
    append("You", message);
    input.value = "";
    const products = result.recommendations || [];
    reply = [result.reply, ...products.map(product => [product.name, product.reason].filter(Boolean).join(". ")),
      result.follow_up].filter(Boolean).join("\n");
    append("Assistant", result.reply, products, result.follow_up);
    hindi = result.language === "Hindi";
    if (result.intent === "appointment_cancel") actions.replaceChildren();
    else if (result.slots?.length || result.intent === "appointment_request" && !actions.childElementCount) {
      showSlots(result.slots || []);
    }
    playButton.disabled = false;
    input.focus();
  });
};

recordButton.onclick = () => {
  if (recorder?.state === "recording") {
    recorder.stop();
    return;
  }
  run(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    try {
      const mic = new MediaRecorder(stream);
      recorder = mic;
      const parts = [];
      mic.ondataavailable = event => parts.push(event.data);
      mic.onstop = () => {
        clearTimeout(timer);
        stream.getTracks().forEach(track => track.stop());
        recordButton.textContent = "Record";
        run(async () => {
          const formData = new FormData();
          formData.set("file", new Blob(parts, {type:mic.mimeType}), "recording");
          input.value = (await post("/voice/transcribe", formData)).text;
          input.focus();
        });
      };
      mic.start();
      recordButton.textContent = "Stop";
      timer = setTimeout(() => {if (mic.state === "recording") mic.stop();}, 60000);
    } catch (error) {
      stream.getTracks().forEach(track => track.stop());
      throw error;
    }
  });
};

playButton.onclick = () => run(async () => {
  if (!reply || recorder?.state === "recording") return;
  const url = URL.createObjectURL(await post("/voice/speak", {text:reply.slice(0,3000)}));
  const player = new Audio(url);
  player.onended = player.onerror = () => URL.revokeObjectURL(url);
  try {
    await player.play();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
});

fetch(path + "/info").then(response => response.json()).then(data => {
  document.querySelector("#business").textContent = data.name;
  document.querySelector("#mode").textContent = data.mode === "mock" ? "Mock demo" : "AI assistant";
  if (data.welcome) append("Assistant", data.welcome);
  document.body.dataset.theme = data.theme;
  timezone = data.timezone || timezone;
  appointmentLabel = data.appointment_label || appointmentLabel;
  appointmentLabelHi = data.appointment_label_hi || appointmentLabelHi;
  recordButton.hidden = playButton.hidden = data.mode !== "live";
}).catch(() => append("Status", "Assistant is unavailable."));
