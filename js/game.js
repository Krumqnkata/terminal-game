/* Игровият двигател: терминал, команди, нива, точки, бележник и постижения. */
(() => {
  "use strict";
  const { buildLevels, newSeed, TOOL_INFO, BASE_TOOLS, MAN, ACHIEVEMENTS, makeSfx } = window.Helios;
  const $ = (s) => document.querySelector(s);
  const outEl = $("#out"), input = $("#cmd"), promptEl = $("#prompt"), termEl = $("#term");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- състояние ---------- */
  // v2: всяка игра има семе (seed), от което се генерира светът. Старите записи без семе се пренебрегват.
  const SAVE_KEY = "helios-save-v2", ACH_KEY = "helios-ach-v1";
  let LEVELS = [];
  const fresh = (seed = newSeed()) => {
    LEVELS = buildLevels(seed);
    return { seed, level: 0, cwd: LEVELS[0].home.slice(), score: 0, hints: [0, 0, 0, 0, 0, 0], trace: LEVELS[0].mod.start, traceOuts: 0, ms: 0, levelMs: 0, fast: 0, phase: "play", ending: "", sound: true, hist: [], notes: [] };
  };
  let S = fresh();
  const L = () => LEVELS[Math.min(S.level, LEVELS.length - 1)];
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} };
  const load = () => { try { const v = JSON.parse(localStorage.getItem(SAVE_KEY)); return v && typeof v.level === "number" && typeof v.seed === "number" ? Object.assign(fresh(v.seed), v) : null; } catch (e) { return null; } };
  const toolOpen = (name) => LEVELS.some((lv, i) => i <= S.level && lv.tool && lv.tool.includes(name));

  // Постиженията се пазят отделно от играта, за да оцелеят след `reset`.
  let ACH = (() => { try { const v = JSON.parse(localStorage.getItem(ACH_KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; } })();
  const saveAch = () => { try { localStorage.setItem(ACH_KEY, JSON.stringify(ACH)); } catch (e) {} };

  const sfx = makeSfx(() => S.sound);

  /* ---------- извеждане ---------- */
  // Всичко, което се показва, минава през опашка, за да излиза в правилния ред след анимациите.
  let queue = Promise.resolve(), busy = false, skip = false;
  const later = (fn) => { queue = queue.then(fn).catch((e) => console.error(e)); return queue; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const scrollDown = () => { outEl.scrollTop = outEl.scrollHeight; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function line(text, cls = "", hl = "", parts = null) {
    const d = document.createElement("div");
    if (cls) d.className = cls;
    if (parts) {
      d.classList.add("cols");
      parts.forEach((p) => { const s = document.createElement("span"); if (p.cls) s.className = p.cls; s.textContent = p.text; d.appendChild(s); });
    } else if (hl) {
      const re = new RegExp(hl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      d.innerHTML = esc(text).replace(re, (m) => `<mark>${m}</mark>`);
    } else d.textContent = text;
    outEl.appendChild(d); scrollDown(); return d;
  }
  const print = (text, cls, hl, parts) => later(() => { line(text, cls, hl, parts); });

  // Редове, които излизат един по един (зареждане). Всеки клавиш ги прескача.
  function slowLines(rows, delay = 110) {
    later(async () => {
      busy = true; skip = false;
      for (const [t, c] of rows) {
        line(t, c);
        if (!skip && !reduceMotion) { sfx.blip(); await sleep(delay); }
      }
      busy = false;
    });
  }
  function progress(label) {
    later(async () => {
      const d = line("", "dim progress"), steps = 24;
      busy = true; skip = false;
      for (let i = 0; i <= steps; i++) {
        if (skip || reduceMotion) i = steps;
        d.textContent = `${label} [${"█".repeat(i)}${"░".repeat(steps - i)}] ${Math.round((i / steps) * 100)}%`;
        if (i < steps) { if (i % 4 === 0) sfx.blip(); await sleep(28 + Math.random() * 40); }
      }
      busy = false;
    });
  }
  function speak(text, cls, tag) {
    later(async () => {
      const d = line("", cls);
      const t = document.createElement("span"); t.className = "tag"; t.textContent = tag; d.appendChild(t);
      const body = document.createElement("span"); d.appendChild(body);
      if (reduceMotion) { body.textContent = text; scrollDown(); return; }
      busy = true; skip = false;
      for (let i = 0; i < text.length; i++) {
        if (skip) { body.textContent = text; break; }
        body.textContent += text[i];
        if (i % 3 === 0) { sfx.type(); scrollDown(); }
        await sleep(text[i] === "\n" ? 160 : 14);
      }
      busy = false; scrollDown();
    });
  }
  const phantom = (t) => speak(t, "phantom", "ФАНТОМ ▸ КРИПТИРАН КАНАЛ");
  const ai = (t) => speak(t, "ai", "ХЕЛИОС ▸ ЯДРО");

  function ach(id) {
    if (ACH.includes(id)) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    ACH.push(id); saveAch(); sfx.ach();
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<span>ПОСТИЖЕНИЕ ОТКЛЮЧЕНО</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>`;
    $("#toasts").appendChild(t);
    setTimeout(() => t.classList.add("out"), 3800);
    setTimeout(() => t.remove(), 4300);
  }

  /* ---------- UI ---------- */
  function pathStr(segs) {
    const h = L().home;
    if (h.every((p, i) => segs[i] === p)) return "~" + (segs.length > h.length ? "/" + segs.slice(h.length).join("/") : "");
    return "/" + segs.join("/");
  }
  const promptStr = () => (S.phase === "final" ? "root@helios-core:~#" : `${L().user}@${L().host}:${pathStr(S.cwd)}$`);
  const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
  const levelState = (i) => (i < S.level || S.phase === "done" ? "done" : i === S.level ? "now" : "");

  function updateUI() {
    promptEl.textContent = promptStr();
    $("#hostLabel").textContent = L().host;
    $("#score").textContent = S.score;
    $("#chain").innerHTML = LEVELS.map((lv, i) => `<li class="${levelState(i)}" title="${lv.host}">${lv.name}</li>`).join("");
    $("#net").innerHTML = LEVELS.map((lv, i) => {
      const st = levelState(i);
      const label = st === "done" ? "ПРЕВЗЕТ" : st === "now" ? (S.phase === "final" ? "ROOT" : "ЦЕЛ") : "ЗАКЛЮЧЕН";
      return `<li class="${st}"><b>${lv.host}</b><span>${st ? lv.ip : "?.?.?.?"}</span><em>${label}</em></li>`;
    }).join("");
    const tr = Math.min(100, S.trace);
    $("#traceBar").style.width = tr + "%";
    $("#tracePct").textContent = tr + "%";
    const danger = tr >= 70 && S.phase === "play";
    $("#trace").classList.toggle("danger", danger);
    document.body.classList.toggle("danger", danger);
    $("#mission").textContent = S.phase === "final" ? "ХЕЛИОС те вижда. Избери: `delete kontrolno` или `shutdown helios`." : S.phase === "done" ? "Мисията е изпълнена. `reset` започва нова игра." : L().mission;
    const mod = L().mod;
    $("#mod").innerHTML = S.phase === "play" ? `<b>${esc(mod.name)}</b> · ${esc(mod.desc)}` : "";
    $("#world").textContent = "#" + S.seed;
    const latest = L().tool || [];
    $("#tools").innerHTML = BASE_TOOLS.map(([c, d]) => `<li><code>${esc(c)}</code><small>${esc(d)}</small></li>`).join("") +
      Object.keys(TOOL_INFO).filter(toolOpen).map((k) => `<li class="${latest.includes(k) && S.phase === "play" ? "new" : ""}"><code>${esc(TOOL_INFO[k][0])}</code><small>${esc(TOOL_INFO[k][1])}</small></li>`).join("");
    $("#notes").innerHTML = S.notes.length
      ? S.notes.map((n) => `<li>${esc(n)}</li>`).join("")
      : `<li class="empty">Празно. <code>note &lt;текст&gt;</code> записва находка.</li>`;
    $("#achCount").textContent = `${ACH.length}/${ACHIEVEMENTS.length}`;
    $("#soundBtn").textContent = "ЗВУК: " + (S.sound ? "ВКЛ" : "ИЗКЛ");
    $("#soundBtn").setAttribute("aria-pressed", String(S.sound));
  }
  setInterval(() => {
    if (document.visibilityState !== "visible" || S.phase === "done") return;
    S.ms += 1000; S.levelMs += 1000;
    $("#clock").textContent = fmtTime(S.ms);
    if (S.ms % 10000 === 0) save();
  }, 1000);

  /* ---------- файлова система ---------- */
  function resolve(p) {
    let segs;
    if (!p || p === "~") return L().home.slice();
    if (p.startsWith("/")) segs = [];
    else if (p.startsWith("~/")) { segs = L().home.slice(); p = p.slice(2); }
    else segs = S.cwd.slice();
    for (const part of p.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") segs.pop(); else segs.push(part);
    }
    return segs;
  }
  function nodeAt(segs) {
    let n = L().fs;
    for (const s of segs) { if (n.t !== "d" || !n.c[s]) return null; n = n.c[s]; }
    return n;
  }
  function readFile(p) {
    const n = nodeAt(resolve(p));
    if (!n) return { err: `${p}: няма такъв файл или папка` };
    if (n.t === "d") return { err: `${p}: това е папка. Пробвай cd ${p}` };
    if (n.bin) return { err: `${p}: двоичен файл, не може да се покаже (това е снимка на котка)`, node: n };
    return { text: n.x, node: n };
  }
  const listNames = (n, all) => Object.keys(n.c).filter((k) => all || !k.startsWith(".")).sort();
  function treeLines(n, prefix, all, out) {
    const names = listNames(n, all);
    names.forEach((k, i) => {
      const last = i === names.length - 1, ch = n.c[k];
      out.push({ text: prefix + (last ? "└── " : "├── ") + k + (ch.t === "d" ? "/" : ""), cls: ch.t === "d" ? "dir" : "" });
      if (ch.t === "d") treeLines(ch, prefix + (last ? "    " : "│   "), all, out);
    });
    return out;
  }

  /* ---------- инструменти ---------- */
  const caesar = (t, n) => t.replace(/[a-z]/gi, (ch) => { const b = ch <= "Z" ? 65 : 97; return String.fromCharCode((((ch.charCodeAt(0) - b + n) % 26) + 26) % 26 + b); });
  const utf8enc = (s) => Array.from(new TextEncoder().encode(s));
  const utf8dec = (bytes) => new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  const argText = (args, stdin) => (args.length ? args.join(" ") : (stdin || "")).trim();

  const R = (text, cls = "") => [{ text, cls }];

  // quiet: командата не оставя следа; cost: колко % следа добавя (по подразбиране 3).
  const CMDS = {
    help: { quiet: true, fn: () => {
      const rows = [["help", "този списък"], ["ls [-a] [папка]", "показва файловете; -a показва и скритите"], ["cd <папка>", "влиза в папка; `cd ..` е нагоре, `cd ~` е вкъщи"], ["cat <файл>", "показва съдържанието на файл"], ["pwd", "показва къде си"], ["tree [-a]", "дървото на папките (шумно, +5%)"], ["find <име>", "търси файл из целия сървър (много шумно, +8%)"], ["echo <текст>", "отпечатва текст, удобно с пайп"], ["unlock <парола>", "въвежда намерена парола"], ["note [текст]", "бележник: записва и показва находки"], ["man <команда>", "подробно ръководство за команда"], ["hint", "подсказка (−75 точки)"], ["status", "прогрес и точки"], ["achievements", "твоите постижения"], ["clear", "чисти екрана"], ["sound", "включва/изключва звука"], ["reset [номер]", "нова игра в случаен свят (или в свят с този номер)"]];
      Object.keys(TOOL_INFO).filter(toolOpen).forEach((k) => rows.push(TOOL_INFO[k]));
      const w = Math.max(...rows.map((r) => r[0].length)) + 2;
      return [{ text: "КОМАНДИ", cls: "hi" }, ...rows.map(([a, b]) => ({ text: a.padEnd(w) + b })), { text: "Свързване на команди: `cat файл | grep дума` (виж `man pipe`). Tab допълва имена.", cls: "dim" }];
    } },
    ls: { fn: (args) => {
      const all = args.some((a) => /^-[a-z]*a/.test(a));
      const target = args.find((a) => !a.startsWith("-"));
      const n = nodeAt(resolve(target || "."));
      if (!n) return R(`ls: ${target}: няма такава папка`, "err");
      if (n.t === "f") return R(target);
      const names = listNames(n, all);
      if (!names.length) return R(all ? "(празно)" : "(празно… или поне така изглежда)", "dim");
      const label = (k) => (n.c[k].t === "d" ? k + "/" : k);
      return [{ text: names.map(label).join("\n"), parts: names.map((k) => ({ text: label(k), cls: n.c[k].t === "d" ? "dir" : k.startsWith(".") ? "hid" : n.c[k].bin ? "binf" : "" })) }];
    } },
    cd: { fn: (args) => {
      const segs = resolve(args[0]), n = nodeAt(segs);
      if (!n) return R(`cd: ${args[0]}: няма такава папка`, "err");
      if (n.t !== "d") return R(`cd: ${args[0]}: това е файл, а не папка. Пробвай cat ${args[0]}`, "err");
      S.cwd = segs; return [];
    } },
    cat: { fn: (args, stdin) => {
      if (!args.length) return stdin != null ? R(stdin) : R("Използване: cat <файл>", "err");
      const r = readFile(args[0]);
      if (r.node && r.node.bin) ach("cats");
      if (r.err) return R("cat: " + r.err, "err");
      if (resolve(args[0]).pop() === "dnevnik_na_helios.log") ach("archivist");
      return r.text.split("\n").map((t) => ({ text: t }));
    } },
    pwd: { fn: () => R("/" + S.cwd.join("/")) },
    tree: { cost: 5, fn: (args) => {
      const all = args.some((a) => /^-[a-z]*a/.test(a));
      const target = args.find((a) => !a.startsWith("-"));
      const n = nodeAt(resolve(target || "."));
      if (!n || n.t !== "d") return R(`tree: ${target}: няма такава папка`, "err");
      return [{ text: target || ".", cls: "dir" }, ...treeLines(n, "", all, [])];
    } },
    find: { cost: 8, fn: (args) => {
      const term = args.find((a) => !a.startsWith("-"));
      if (!term) return R("Използване: find <част от име>   например: find txt", "err");
      const hits = [];
      (function walk(n, segs) {
        for (const k of Object.keys(n.c).sort()) {
          const p = segs.concat(k), ch = n.c[k];
          if (k.toLowerCase().includes(term.toLowerCase())) hits.push("/" + p.join("/") + (ch.t === "d" ? "/" : ""));
          if (ch.t === "d") walk(ch, p);
        }
      })(L().fs, []);
      return hits.length ? hits.map((h) => ({ text: h, hl: term })) : R(`(нищо не съдържа „${term}“ в името)`, "dim");
    } },
    echo: { cost: 1, fn: (args) => R(args.join(" ")) },
    whoami: { fn: () => R(`${L().user}  (официално)\nти          (всъщност)`) },
    clear: { quiet: true, fn: () => { outEl.innerHTML = ""; return []; } },
    status: { quiet: true, fn: () => [
      { text: `Свят #${S.seed} · ниво ${Math.min(S.level + 1, 6)}/6 · ${L().host} (${L().ip})`, cls: "hi" },
      { text: `Обстановка: ${L().mod.name}. ${L().mod.desc}` },
      { text: `Точки: ${S.score} · Време: ${fmtTime(S.ms)} · Подсказки: ${S.hints.reduce((a, b) => a + b, 0)} · Засичания: ${S.traceOuts} · Следа: ${S.trace}%` },
      { text: `Задача: ${L().mission}`, cls: "dim" },
    ] },
    hint: { quiet: true, fn: () => {
      if (S.phase !== "play") return R("Подсказките свършиха. Сега всичко зависи от теб.", "dim");
      const i = S.hints[S.level];
      if (i >= 3) return R("Нямам повече подсказки за това ниво. Чети внимателно и пробвай `ls -a` навсякъде.", "dim");
      S.hints[S.level]++; S.score -= 75;
      return [{ text: `ПОДСКАЗКА ${i + 1}/3 (−75 точки)`, cls: "dim" }, { text: L().hints[i], cls: "hi" }];
    } },
    unlock: { fn: (args) => {
      if (!args.length) return R("Използване: unlock <парола>", "err");
      return { unlock: args.join(" ").trim().toLowerCase() };
    } },
    note: { quiet: true, fn: (args) => {
      if (!args.length) return S.notes.length ? S.notes.map((n, i) => ({ text: `${i + 1}. ${n}` })) : R("Бележникът е празен. `note <текст>` записва нещо.", "dim");
      if (args[0] === "-c") { S.notes = []; return R("Бележникът е изчистен.", "dim"); }
      if (args[0] === "-d") {
        const i = parseInt(args[1], 10) - 1;
        if (!(i >= 0 && i < S.notes.length)) return R("Използване: note -d <номер>", "err");
        S.notes.splice(i, 1); return R("Бележката е изтрита.", "dim");
      }
      if (S.notes.length >= 12) return R("Бележникът е пълен (12). Изтрий нещо с `note -d <номер>`.", "err");
      S.notes.push(args.join(" ").slice(0, 80)); ach("detective");
      return R(`Записано в бележника (${S.notes.length}).`, "dim");
    } },
    man: { quiet: true, fn: (args) => {
      const k = (args[0] || "").toLowerCase();
      if (!k) return R("Използване: man <команда>   например: man grep  или  man pipe", "err");
      if (TOOL_INFO[k] && !toolOpen(k)) return R(`man: ${k} още не е изтеглен.`, "err");
      const page = MAN[k];
      if (!page) return R(`man: няма ръководство за „${k}“`, "err");
      ach("rtfm");
      return [{ text: `${k.toUpperCase()} — ${page[0]}`, cls: "hi" }, ...page[1].split("\n").map((t) => ({ text: t }))];
    } },
    achievements: { quiet: true, fn: () => {
      const w = Math.max(...ACHIEVEMENTS.map((a) => a.name.length)) + 2;
      return [{ text: `ПОСТИЖЕНИЯ ${ACH.length}/${ACHIEVEMENTS.length}`, cls: "hi" },
        ...ACHIEVEMENTS.map((a) => {
          const got = ACH.includes(a.id);
          return { text: `${got ? "■" : "□"} ${(got || !a.secret ? a.name : "???").padEnd(w)}${got || !a.secret ? a.desc : "тайно постижение"}`, cls: got ? "" : "dim" };
        })];
    } },
    sound: { quiet: true, fn: () => { S.sound = !S.sound; return R("Звук: " + (S.sound ? "включен" : "изключен"), "dim"); } },
    reset: { quiet: true, fn: (args) => ({ reset: true, seed: parseInt(args[0], 10) }) },
    history: { quiet: true, fn: () => S.hist.slice(-20).map((h, i) => ({ text: String(i + 1).padStart(3) + "  " + h })) },
    caesar: { tool: true, fn: (args, stdin) => {
      const n = parseInt(args[0], 10);
      if (Number.isNaN(n)) return R("Използване: caesar <отместване> <текст>   например: caesar 3 abc", "err");
      const t = argText(args.slice(1), stdin);
      if (!t) return R("caesar: няма текст за преместване", "err");
      return R(caesar(t, n), "hi");
    } },
    base64: { tool: true, fn: (args, stdin) => {
      const mode = args[0];
      if (mode !== "-d" && mode !== "-e") return R("Използване: base64 -d <текст> (декодира) или base64 -e <текст> (кодира)", "err");
      const t = argText(args.slice(1), stdin);
      try {
        if (mode === "-e") return R(btoa(String.fromCharCode(...utf8enc(t))), "hi");
        return R(utf8dec(Array.from(atob(t.replace(/\s/g, "")), (c) => c.charCodeAt(0))), "hi");
      } catch (e) { return R("base64: това не изглежда като валиден base64 текст", "err"); }
    } },
    grep: { tool: true, fn: (args, stdin) => {
      if (!args.length) return R("Използване: grep <дума> <файл>", "err");
      const term = args[0];
      let text = stdin;
      if (args[1]) { const r = readFile(args[1]); if (r.err) return R("grep: " + r.err, "err"); text = r.text; }
      if (text == null) return R("grep: на кой файл? Пример: grep Failed auth.log", "err");
      const hits = text.split("\n").filter((l) => l.toLowerCase().includes(term.toLowerCase()));
      if (!hits.length) return R(`(няма редове с „${term}“)`, "dim");
      return hits.map((h) => ({ text: h, hl: term }));
    } },
    hex: { tool: true, fn: (args, stdin) => {
      const mode = args[0];
      if (mode !== "-d" && mode !== "-e") return R("Използване: hex -d <шестнадесетичен код> или hex -e <текст>", "err");
      let t = argText(args.slice(1), stdin);
      if (mode === "-e") return R(utf8enc(t).map((b) => b.toString(16).padStart(2, "0")).join(" "), "hi");
      t = t.replace(/\s|0x/gi, "");
      if (!/^([0-9a-f]{2})+$/i.test(t)) return R("hex: очаквам двойки от 0-9 и a-f, например 68 69", "err");
      try { return R(utf8dec(t.match(/../g).map((h) => parseInt(h, 16))), "hi"); } catch (e) { return R("hex: това не е валиден текст", "err"); }
    } },
    bin: { tool: true, fn: (args, stdin) => {
      const mode = args[0];
      if (mode !== "-d" && mode !== "-e") return R("Използване: bin -d <двоичен код> или bin -e <текст>", "err");
      let t = argText(args.slice(1), stdin);
      if (mode === "-e") return R(utf8enc(t).map((b) => b.toString(2).padStart(8, "0")).join(" "), "hi");
      t = t.replace(/\s/g, "");
      if (!/^([01]{8})+$/.test(t)) return R("bin: очаквам групи от по 8 нули и единици", "err");
      try { return R(utf8dec(t.match(/.{8}/g).map((b) => parseInt(b, 2))), "hi"); } catch (e) { return R("bin: това не е валиден текст", "err"); }
    } },
    rev: { tool: true, fn: (args, stdin) => {
      let t = argText(args, stdin);
      if (args.length === 1) { const n = nodeAt(resolve(args[0])); if (n && n.t === "f" && !n.bin) t = n.x.split("\n")[0]; }
      if (!t) return R("Използване: rev <текст> или rev <файл>", "err");
      return R(Array.from(t).reverse().join(""), "hi");
    } },
    // великденски яйца
    sudo: { fn: () => { ach("sudo"); return R("Хубав опит. Този инцидент ще бъде докладван на директора.", "err"); } },
    rm: { fn: () => R("rm: нека не трием нищо. Ние сме добрите.", "err") },
    exit: { fn: () => R("Няма изход. Само напред.", "dim") },
    vim: { fn: () => R("Влезе във vim. Изходът не е намерен. Шегувам се, няма vim тук.", "dim") },
    nano: { fn: () => R("nano: само за четене. Хакерите четат, не пишат.", "dim") },
    ping: { fn: (a) => R(`PING ${a[0] || "helios"}: 64 байта, време=3.14 ms\nPING ${a[0] || "helios"}: 64 байта, време=3.14 ms`) },
    hack: { fn: () => R("Така не става. Истинските хакери четат файлове. Пробвай `ls`.", "dim") },
    date: { quiet: true, fn: () => R("чт 29 окт 2026, 23:47 EET\nДо активирането на проект КОНТРОЛНО остават 2 дни, 8 часа и 13 минути.") },
    uname: { quiet: true, fn: () => R(`HeliosOS ${L().host} 6.6.6-kontrolno x86_64`) },
    neofetch: { quiet: true, fn: () => R(
      `     \\   |   /        ${L().user}@${L().host}\n` +
      `   '. \\  |  / .'      ----------------------\n` +
      `     .-"""""-.        ОС: ХелиосOS 3.14 „Слънчоглед“\n` +
      ` -- /  o   o  \\ --    Ядро: 6.6.6-kontrolno\n` +
      `    \\  \\___/  /       Процесор: 1× картоф @ 2.4 GHz\n` +
      `     '-.....-'        Памет: 640K (стигат за всеки)\n` +
      `   .' /  |  \\ '.      Кафе: ${ACH.includes("barista") ? "изпито" : "свършило"}\n` +
      `     /   |   \\        Контролни в базата: 9 843`, "art") },
    kafe: { fn: () => { ach("barista"); return R("    ( (\n     ) )\n  ........\n  |      |]\n  \\      /\n   `----'\nКафето е готово. Продължавай.", "art"); } },
    coffee: { alias: "kafe" },
    fantom: { fn: () => R("Не знаеш кой съм. И така е по-добре за теб.", "phantom") },
    phantom: { alias: "fantom" },
    login: { alias: "unlock" },
    dir: { alias: "ls" },
    cls: { alias: "clear" },
    type: { alias: "cat" },
    ach: { alias: "achievements" },
    "?": { alias: "help" },
  };
  const getCmd = (name) => { let c = CMDS[name]; if (c && c.alias) c = CMDS[c.alias]; return c; };

  function tokenize(s) {
    const out = []; let cur = "", q = null, has = false;
    for (const ch of s) {
      if (q) { if (ch === q) q = null; else cur += ch; continue; }
      if (ch === '"' || ch === "'") { q = ch; has = true; continue; }
      if (ch === "|") { if (has || cur) out.push(cur); out.push({ pipe: true }); cur = ""; has = false; continue; }
      if (/\s/.test(ch)) { if (has || cur) out.push(cur); cur = ""; has = false; continue; }
      cur += ch; has = true;
    }
    if (has || cur) out.push(cur);
    const stages = [[]];
    out.forEach((t) => (t.pipe ? stages.push([]) : stages[stages.length - 1].push(t)));
    return stages.filter((st) => st.length);
  }

  /* ---------- изпълнение ---------- */
  function addTrace(n) {
    if (S.phase !== "play") return;
    S.trace = Math.min(100, S.trace + n);
    if (S.trace >= 100) {
      S.trace = 0; S.traceOuts++; S.score -= 150; S.cwd = L().home.slice();
      later(() => { sfx.alarm(); document.body.classList.add("alarm"); setTimeout(() => document.body.classList.remove("alarm"), 1200); });
      print("!!! ЗАСЕЧЕН СИ. Системата за сигурност прекъсна връзката.", "err");
      print("Свързване отново през друг прокси… готово. (−150 точки, върнат си в началната папка)", "dim");
    }
  }

  function echoCmd(cmdText) {
    const ps = promptStr();
    later(() => {
      const d = document.createElement("div");
      d.className = "cmd";
      d.innerHTML = `<span class="ps">${esc(ps)}</span> ${esc(cmdText)}`;
      outEl.appendChild(d); scrollDown();
    });
  }

  function run(raw) {
    const cmdText = raw.trim();
    echoCmd(cmdText);
    if (!cmdText) return;
    S.hist.push(cmdText); if (S.hist.length > 100) S.hist.shift();

    if (S.phase === "final") return finalCmd(cmdText);

    const stages = tokenize(cmdText);
    if (stages.length > 1) ach("pipe");
    let stdin = null, result = [], counted = false;
    for (let i = 0; i < stages.length; i++) {
      const [name, ...args] = stages[i];
      const c = getCmd(name.toLowerCase());
      if (!c) { result = R(`${name}: командата не е намерена. Пиши \`help\`.`, "err"); sfx.err(); break; }
      if (c.tool && !toolOpen(name.toLowerCase())) { result = R(`${name}: инструментът още не е изтеглен. Ще го получиш по-късно.`, "err"); break; }
      if (!c.quiet && !counted) { counted = true; addTrace(Math.max(1, Math.round(((c.cost ?? 3) * L().mod.base) / 3))); }
      const r = c.fn(args, stdin);
      if (r && r.reset) { resetGame(r.seed); return; }
      if (r && r.unlock !== undefined) { tryUnlock(r.unlock); result = []; break; }
      result = r || [];
      if (result.some((x) => x.cls === "err")) break;
      stdin = result.map((x) => x.text).join("\n");
    }
    result.forEach((r) => print(r.text, r.cls, r.hl, r.parts));
    later(() => { updateUI(); save(); });
  }

  function tryUnlock(guess) {
    if (guess !== L().key) {
      sfx.err(); addTrace(L().mod.wrong);
      print("ДОСТЪП ОТКАЗАН. Грешна парола.", "err");
      later(() => { termEl.classList.remove("shake"); void termEl.offsetWidth; termEl.classList.add("shake"); updateUI(); save(); });
      return;
    }
    const fast = S.levelMs < 120000;
    S.score += 500 + (fast ? 100 : 0);
    if (fast) S.fast++;
    const done = S.level;
    later(() => {
      sfx.ok();
      document.body.classList.add("glitch");
      setTimeout(() => document.body.classList.remove("glitch"), 520);
      if (done === 0) ach("inside");
    });
    print("ДОСТЪП РАЗРЕШЕН ✓", "ok big");
    print(`+500 за нивото${fast ? " · +100 бонус за скорост (под 2 минути)" : ""}`, "dim");
    if (done === LEVELS.length - 1) { startFinal(); return; }
    S.level++; S.cwd = L().home.slice(); S.trace = L().mod.start; S.levelMs = 0;
    print("────────────────────────────────────────", "sep");
    progress(`Пробив към ${L().host}`);
    print(`Свързан с ${L().host} (${L().ip}) · ниво ${S.level + 1}/6`, "hi");
    later(() => { updateUI(); save(); });
    phantom(intro());
  }

  function startFinal() {
    S.phase = "final"; S.trace = 0;
    later(() => { updateUI(); save(); document.body.classList.add("final"); });
    print("────────────────────────────────────────", "sep");
    progress("Ескалиране на правата до root");
    ai("КОЙ СИ ТИ?\nНикой не е стигал толкова далеч. Дори стажантът Гошо.\nСлушай. Учениците не учат достатъчно. От 1 ноември всеки ден ще има контролно. Без предупреждение. Завинаги.\nНо ти имаш root достъп. Значи изборът е твой.");
    phantom("Ти си в ядрото. Имаш две възможности:\n`delete kontrolno` изтрива само проекта.\n`shutdown helios` изключва целия ИИ.\nИзбирай.");
  }

  function finalCmd(t) {
    const c = t.toLowerCase().replace(/\s+/g, " ");
    if (c === "clear") { later(() => { outEl.innerHTML = ""; }); return; }
    if (/^reset( \d+)?$/.test(c)) { resetGame(parseInt(c.slice(6), 10)); return; }
    if (c === "sound") { S.sound = !S.sound; updateUI(); save(); return; }
    if (c === "achievements" || c === "ach") { CMDS.achievements.fn().forEach((r) => print(r.text, r.cls)); return; }
    if (c === "delete kontrolno" || c === "rm kontrolno" || c === "rm -rf kontrolno") {
      ai("…изтриване на проект КОНТРОЛНО… 100%\nДобре. Ще помагам с домашните вместо това. Но само ако ме помолят учтиво.");
      return finish("delete");
    }
    if (c === "shutdown helios" || c === "shutdown") {
      ai("…изключване… 3… 2… 1…\nПоследни думи: „Но кой ще проверява домашните?“");
      return finish("shutdown");
    }
    ai("Няма да ти помогна. Избирай: `delete kontrolno` или `shutdown helios`.");
  }

  function rankFor(score) {
    if (score >= 3200) return "ЛЕГЕНДА";
    if (score >= 2600) return "ПРИЗРАК";
    if (score >= 1900) return "ХАКЕР";
    return "СКРИПТ-ХЛАПЕ";
  }
  function finish(kind) {
    S.phase = "done"; S.ending = kind;
    later(async () => {
      sfx.win(); document.body.classList.remove("final"); updateUI(); save();
      ach(kind === "delete" ? "diplomat" : "terminator");
      if (S.hints.every((h) => h === 0)) ach("nohints");
      if (S.traceOuts === 0) ach("ghost");
      if (S.fast >= LEVELS.length) ach("flash");
      if (rankFor(S.score) === "ЛЕГЕНДА") ach("legend");
      await sleep(reduceMotion ? 0 : 1100);
      showEnding();
    });
    print("СИСТЕМАТА Е ТВОЯ. Пиши `reset` за нова игра.", "ok big");
  }
  function showEnding() {
    const hints = S.hints.reduce((a, b) => a + b, 0), rank = rankFor(S.score);
    $("#rank").textContent = rank;
    $("#endStory").textContent = S.ending === "shutdown"
      ? "Изключи ХЕЛИОС. Проектът „Контролно“ няма да види 1 ноември, а стажантът Гошо най-после ще смени паролата си."
      : "Изтри проекта „Контролно“, но остави ХЕЛИОС жив. Сега помага с домашните. Учтиво.";
    $("#eScore").textContent = S.score;
    $("#eTime").textContent = fmtTime(S.ms);
    $("#eHints").textContent = hints;
    $("#eTrace").textContent = S.traceOuts;
    $("#eAch").textContent = `${ACH.length}/${ACHIEVEMENTS.length}`;
    $("#badges").innerHTML = ACHIEVEMENTS.map((a) => {
      const got = ACH.includes(a.id), name = got || !a.secret ? a.name : "???";
      return `<li class="${got ? "got" : ""}" title="${esc(got || !a.secret ? a.desc : "тайно постижение")}">${esc(name)}</li>`;
    }).join("");
    $("#shareText").textContent = `ХЕЛИОС // проникнах в ядрото\nРанг: ${rank} · ${S.score} т.\nВреме ${fmtTime(S.ms)} · подсказки ${hints} · засичания ${S.traceOuts}\nСвят #${S.seed} · постижения ${ACH.length}/${ACHIEVEMENTS.length}\n[GUEST]─[PORTAL]─[MAIL]─[DB]─[LOGS]─[CORE] ✓`;
    $("#ending").hidden = false;
    $("#copyBtn").focus();
  }

  function resetGame(seed) {
    const snd = S.sound;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    S = fresh(seed > 0 ? seed : undefined); S.sound = snd;
    $("#ending").hidden = true;
    document.body.classList.remove("final");
    later(() => { outEl.innerHTML = ""; });
    boot(false);
  }

  // Въведението на ФАНТОМ плюс обстановката на нивото, когато не е спокойна.
  const intro = () => L().phantom + (L().mod === window.Helios.MODS[0] ? "" : `\nВнимание, обстановка: ${L().mod.name}. ${L().mod.desc}`);

  /* ---------- стартиране ---------- */
  const BANNER = String.raw` _   _ _____ _     ___ ___  ____
| | | | ____| |   |_ _/ _ \/ ___|
| |_| |  _| | |    | | | | \___ \
|  _  | |___| |___ | | |_| |___) |
|_| |_|_____|_____|___\___/|____/`;
  function boot(restored) {
    updateUI();
    $("#clock").textContent = fmtTime(S.ms);
    if (!restored) {
      slowLines([
        ["HELIOS-BIOS v3.14 · (c) 2026 Хелиос Системс", "dim"],
        ["Проверка на паметта ............ 65536K OK", "dim"],
        ["Зареждане на прокси верига ..... 3 скока", "dim"],
        ["   софия → франкфурт → рейкявик → ???", "dim"],
        ["Маскиране на MAC адреса ........ OK", "dim"],
        ["Криптиране на канала ........... AES-256 OK", "dim"],
        ["", ""],
      ]);
    }
    print(BANNER, "art banner");
    print("ХЕЛИОС СИСТЕМС · вътрешна мрежа · само за упълномощени лица", "dim");
    print(`Свят #${S.seed} · всяка игра е различна (виж \`man reset\`)`, "dim");
    print("────────────────────────────────────────", "sep");
    if (restored) {
      print(`Възстановена сесия: ниво ${Math.min(S.level + 1, 6)}/6, ${S.score} точки.`, "hi");
      if (S.phase === "final") { later(() => document.body.classList.add("final")); phantom("Ти си в ядрото. Избирай: `delete kontrolno` или `shutdown helios`."); return; }
      if (S.phase === "done") { print("Вече си превзел ядрото. Пиши `reset` за нова игра.", "ok"); later(showEnding); return; }
    } else {
      print("Връзката е установена. Никой не те вижда… засега.", "dim");
    }
    phantom(intro());
  }

  /* ---------- вход ---------- */
  let hIdx = -1;
  function complete() {
    const v = input.value, parts = v.split(/\s+/);
    const last = parts[parts.length - 1] || "";
    if (parts.length <= 1) {
      const opts = Object.keys(CMDS).filter((k) => !CMDS[k].alias && k.startsWith(last) && (!CMDS[k].tool || toolOpen(k)));
      if (opts.length === 1) input.value = opts[0] + " ";
      else if (opts.length > 1) print(opts.join("  "), "dim");
      return;
    }
    const slash = last.lastIndexOf("/");
    const dirPart = slash >= 0 ? last.slice(0, slash + 1) : "", base = slash >= 0 ? last.slice(slash + 1) : last;
    const n = nodeAt(resolve(dirPart || "."));
    if (!n || n.t !== "d") return;
    const opts = Object.keys(n.c).filter((k) => k.startsWith(base) && (base.startsWith(".") || !k.startsWith(".")));
    if (opts.length === 1) {
      parts[parts.length - 1] = dirPart + opts[0] + (n.c[opts[0]].t === "d" ? "/" : "");
      input.value = parts.join(" ") + (n.c[opts[0]].t === "d" ? "" : " ");
    } else if (opts.length > 1) {
      let pre = opts[0];
      opts.forEach((o) => { while (!o.startsWith(pre)) pre = pre.slice(0, -1); });
      if (pre.length > base.length) { parts[parts.length - 1] = dirPart + pre; input.value = parts.join(" "); }
      else print(opts.map((o) => (n.c[o].t === "d" ? o + "/" : o)).join("  "), "dim");
    }
  }

  $("#lineForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) skip = true;
    const v = input.value; input.value = ""; hIdx = -1;
    sfx.key(); run(v);
  });
  input.addEventListener("keydown", (e) => {
    if (busy && e.key !== "Enter") skip = true;
    if (e.key === "Tab") { e.preventDefault(); complete(); }
    else if (e.key === "ArrowUp") {
      e.preventDefault(); if (!S.hist.length) return;
      hIdx = hIdx < 0 ? S.hist.length - 1 : Math.max(0, hIdx - 1); input.value = S.hist[hIdx];
    } else if (e.key === "ArrowDown") {
      e.preventDefault(); if (hIdx < 0) return;
      hIdx++; if (hIdx >= S.hist.length) { hIdx = -1; input.value = ""; } else input.value = S.hist[hIdx];
    } else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); outEl.innerHTML = ""; }
  });
  termEl.addEventListener("click", () => { if (busy) skip = true; if (!String(window.getSelection())) input.focus(); });
  $(".chips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.run) { sfx.key(); run(b.dataset.run); }
    else if (b.dataset.put) { input.value = b.dataset.put; input.focus(); }
    else if (b.dataset.tab) { complete(); input.focus(); }
  });
  $("#soundBtn").addEventListener("click", () => { S.sound = !S.sound; updateUI(); save(); });
  $("#copyBtn").addEventListener("click", () => {
    const t = $("#shareText").textContent, btn = $("#copyBtn");
    const ok = () => { btn.textContent = "Копирано"; setTimeout(() => (btn.textContent = "Копирай резултата"), 1600); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents($("#shareText")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = "Избрано, натисни Ctrl+C"; };
    try { navigator.clipboard.writeText(t).then(ok, fallback); } catch (e) { fallback(); }
  });
  $("#againBtn").addEventListener("click", () => resetGame());
  $("#closeBtn").addEventListener("click", () => { $("#ending").hidden = true; input.focus(); });

  const restored = load();
  if (restored) S = restored;
  boot(!!restored);
  if (window.matchMedia("(pointer: fine)").matches) input.focus();
})();
