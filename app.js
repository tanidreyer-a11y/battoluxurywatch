/* BATTO. Two canvas frame-sequence scrubs (10k-websites engine, §13.7) driven by ONE rAF loop and
   ONE easing layer: no Lenis, no smooth-scroll CSS, no GSAP. Each scrub owns only its own track.
   The hero stage is fixed and holds its last frame while the sheets lift over it; the chapter 2
   stage is sticky inside its own section. Seams the footage can't make (white side bars in the
   reveal clip, the dark night clip into the lit box clip) are covered by panels of copy: the frame
   index only jumps while a panel fully covers the canvas. Lower sections use one-shot
   IntersectionObserver reveals, not scroll-linked motion. */
(function(){
  "use strict";
  document.documentElement.classList.add("js");
  var reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  function clamp(v, a, b){ return Math.min(Math.max(v, a), b); }
  function smooth(t){ return t * t * (3 - 2 * t); }
  function ramp(p, a, b){ if (b <= a) return p >= b ? 1 : 0; return smooth(clamp((p - a) / (b - a), 0, 1)); }
  function ease(t, e){
    if (e === "in") return 1 - Math.cos(t * Math.PI / 2);
    if (e === "out") return Math.sin(t * Math.PI / 2);
    if (e === "inout") return smooth(t);
    return t;
  }
  var probe = document.getElementById("vhProbe"), unit = 1, cw = 0, ch = 0, dpr = 1;
  var heroFade = document.getElementById("heroFade"), extras = [];
  var HOLD_ZOOM = 0.03, R = 18, DRIFT = 22;

  /* ============================ SCRUB FACTORY ============================ */
  function Scrub(o){
    var S = { o:o, segs:o.segs, TOTAL:0, frames:new Array(o.count), loaded:new Uint8Array(o.count), done:0,
      view:{ frame:0, zoom:1, fx:.5, fy:.5 }, target:0, shown:0, drawnKey:"", scale:1, ox:0, oy:0, ver:0, loading:false };
    S.segs.forEach(function(s){ s.start = S.TOTAL; S.TOTAL += s.len; s.end = S.TOTAL; });
    S.seg = function(name){ for (var i = 0; i < S.segs.length; i++) if (S.segs[i].name === name) return S.segs[i]; };
    S.P = function(f){
      for (var i = 0; i < S.segs.length; i++){
        var s = S.segs[i];
        if (s.hold !== undefined || f < s.from || f > s.to) continue;
        var tgt = (f - s.from) / (s.to - s.from), lo = 0, hi = 1;
        for (var k = 0; k < 30; k++){ var mid = (lo + hi) / 2; if (ease(mid, s.ease) < tgt) lo = mid; else hi = mid; }
        return s.start + s.len * lo;
      }
      return 0;
    };
    o.track.style.height = (S.TOTAL + 100) + "svh";
    var canvas = o.canvas, ctx = canvas.getContext("2d");

    function sample(pos){
      var v = S.view, s = S.segs[S.segs.length - 1];
      for (var i = 0; i < S.segs.length; i++) if (pos < S.segs[i].end){ s = S.segs[i]; break; }
      var t = clamp((pos - s.start) / s.len, 0, 1);
      if (s.hold !== undefined){
        v.frame = s.hold;
        v.zoom = (s.focus && !reduce) ? 1 + HOLD_ZOOM * Math.sin(Math.PI * t) : 1;
        v.fx = s.focus ? s.focus[0] : .5; v.fy = s.focus ? s.focus[1] : .5;
      } else {
        v.frame = s.from + (s.to - s.from) * ease(t, s.ease);
        v.zoom = 1; v.fx = .5; v.fy = .5;
      }
    }
    S.layout = function(){
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      S.scale = (cw / ch < 0.9) ? cw / (o.IW * 0.72) : Math.max(cw / o.IW, ch / o.IH);
      S.ox = (cw - o.IW * S.scale) / 2; S.oy = (ch - o.IH * S.scale) / 2;
      S.ver++; S.drawnKey = "";
      if (o.onLayout) o.onLayout(S);
    };
    function nearest(i){
      if (S.loaded[i]) return i;
      for (var d = 1; d < o.count; d++){
        if (i - d >= 0 && S.loaded[i - d]) return i - d;
        if (i + d < o.count && S.loaded[i + d]) return i + d;
      }
      return -1;
    }
    function draw(){
      var v = S.view, i = nearest(clamp(Math.round(v.frame), 0, o.count - 1));
      if (i < 0) return;
      var key = i + "|" + v.zoom.toFixed(4) + "|" + S.ver;
      if (key === S.drawnKey) return;
      S.drawnKey = key;
      var sc = S.scale, fx = S.ox + v.fx * o.IW * sc, fy = S.oy + v.fy * o.IH * sc;
      var dx = (fx + (S.ox - fx) * v.zoom) * dpr, dy = (fy + (S.oy - fy) * v.zoom) * dpr;
      var dw = o.IW * sc * v.zoom * dpr, dh = o.IH * sc * v.zoom * dpr;
      // Both films are shot on a black void, so portrait bands are the void itself.
      if (dy > 0){ ctx.fillStyle = "#0b0c0e"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(S.frames[i], dx, dy, dw, dh);
    }

    // Beats: opacity = enter * (1 - leave); each kind gets its own entrance
    var specs = o.beatSpec(S);
    S.specs = specs;
    var beats = [].slice.call(o.beatsRoot.querySelectorAll("[data-beat]")).map(function(el, i){
      var s = specs[i];
      return { el:el, kind:el.getAttribute("data-kind"), a:s.a, b:s.b, first:!!s.first, last:!!s.last, o:-1, e:-1,
        live:!!el.querySelector("a,button"), words:[].slice.call(el.querySelectorAll(".w")), rule:el.querySelector(".rule"),
        stretch:el.querySelector(".stretch"), cos:[].slice.call(el.querySelectorAll(".co")) };
    });
    S.beats = beats;
    function entrance(B, e){
      if (B.kind === "words"){
        B.words.forEach(function(w, k){
          var t = reduce ? 1 : clamp(e * 1.7 - k * .28, 0, 1);
          w.style.transform = "translate3d(0," + ((1 - ease(t, "out")) * 0.55).toFixed(3) + "em,0)";
          w.style.opacity = t.toFixed(3);
        });
      } else if (B.kind === "rule" && B.rule){
        B.rule.style.transform = "scaleX(" + (reduce ? 1 : ease(e, "out")).toFixed(3) + ")";
      } else if (B.kind === "stretch" && B.stretch){
        B.stretch.style.fontVariationSettings = '"wdth" ' + (reduce ? 112 : (125 - 13 * ease(e, "out"))).toFixed(1);
      } else if (B.kind === "callouts"){
        B.cos.forEach(function(c, k){
          var t = reduce ? 1 : clamp(e * 2 - k * .16, 0, 1);
          c.querySelector(".lead").style.transform = "scaleX(" + ease(clamp(t * 1.4, 0, 1), "out").toFixed(3) + ")";
          c.querySelector("span").style.opacity = clamp((t - .45) / .55, 0, 1).toFixed(3);
        });
      }
    }
    function paintBeats(pos, introK){
      for (var i = 0; i < beats.length; i++){
        var B = beats[i];
        var e = B.first ? introK : ramp(pos, B.a, B.a + R);
        var l = B.last ? 0 : ramp(pos, B.b - R, B.b);
        var op = e * (1 - l);
        if (op !== B.o){
          B.o = op; B.el.style.opacity = op;
          var drift = (B.kind === "callouts" || reduce) ? 0 : ((1 - e) * DRIFT - l * DRIFT);
          B.el.style.transform = drift ? "translate3d(0," + drift.toFixed(2) + "px,0)" : "";
          if (B.live) B.el.style.pointerEvents = op > .6 ? "auto" : "none";
        }
        if (e !== B.e){ B.e = e; entrance(B, e); }
      }
    }

    S.read = function(){ S.target = clamp((pageYOffset - o.top()) / unit, 0, S.TOTAL); };
    S.visible = function(){ var t = o.top() - pageYOffset; return t < ch * 1.5 && t + (S.TOTAL + 100) * unit > -ch * .5; };
    S.tick = function(dt, introK){
      var gap = S.target - S.shown;
      if (Math.abs(gap) < .01 || reduce) S.shown = S.target;
      else S.shown += gap * (1 - Math.pow(1 - .115, dt / 16.667));
      if (!S.visible() && !o.always) return;
      sample(S.shown); draw();
      paintBeats(S.shown, introK);
      if (o.onPaint) o.onPaint(S, S.shown);
    };
    S.load = function(onSettle){
      if (S.loading) return; S.loading = true;
      var order = [], seen = new Uint8Array(o.count);
      [32, 16, 8, 4, 2, 1].forEach(function(st){ for (var i = 0; i < o.count; i += st) if (!seen[i]){ seen[i] = 1; order.push(i); } });
      if (!seen[o.count - 1]) order.splice(1, 0, o.count - 1);
      order.forEach(function(i){
        var img = new Image(); img.decoding = "async";
        img.onload = function(){ S.loaded[i] = 1; S.drawnKey = ""; S.done++; if (onSettle) onSettle(S); };
        img.onerror = function(){ S.done++; if (onSettle) onSettle(S); };
        img.src = o.src(i); S.frames[i] = img;
      });
    };
    return S;
  }

  /* ============================ HERO ============================ */
  // 863 frames, 1600x900: vid1 reveal 0..190 · vid2 bezel lift 191..350 · vid3 dial + crown 351..509
  //                       vid4 pull-out 510..735 · vid5 exploded view + rebuild 736..862
  var hero = Scrub({
    count:863, IW:1600, IH:900, always:true,
    src:function(i){ return "frames/f" + String(i + 1).padStart(4, "0") + ".webp"; },
    canvas:document.getElementById("cv"), track:document.getElementById("track"),
    beatsRoot:document.querySelector(".beats"), top:function(){ return 0; },
    segs:[
      { hold:0,   len:60 },
      { from:0,   to:190, len:210, ease:"in" },
      { from:190, to:291, len:120, ease:"out" },
      { hold:291, len:140, name:"bezel", focus:[0.5, 0.45] },
      { from:291, to:372, len:110, ease:"inout" },
      { hold:372, len:140, name:"dial",  focus:[0.5, 0.5] },
      { from:372, to:505, len:140, ease:"inout" },
      { hold:505, len:140, name:"crown", focus:[0.5, 0.6] },
      { from:505, to:787, len:290, ease:"inout" },
      { hold:787, len:220, name:"explode" },          // no push-in: callouts stay locked to parts
      { from:787, to:862, len:100, ease:"inout" },
      { hold:862, len:120, name:"end" }
    ],
    beatSpec:function(S){
      var b = S.seg("bezel"), d = S.seg("dial"), c = S.seg("crown"), x = S.seg("explode"), e = S.seg("end");
      return [
        { a:0,           b:S.P(70), first:true },
        { a:b.start + 6, b:b.end - 6 },
        { a:d.start + 6, b:d.end - 6 },
        { a:c.start + 6, b:c.end - 6 },
        { a:x.start + 8, b:x.end - 8 },
        { a:e.start + 4, b:Infinity, last:true }
      ];
    },
    onLayout:function(S){        // callouts anchor in frame coordinates through the draw's scale/offset
      var cos = document.querySelectorAll(".co");
      var col = cw < 700 ? cw * 0.70 : Math.max(cw * 0.64, S.ox + 1600 * S.scale * 0.66);
      for (var i = 0; i < cos.length; i++){
        var c = cos[i];
        var ax = S.ox + parseFloat(c.getAttribute("data-x")) * 1600 * S.scale;
        var ay = S.oy + parseFloat(c.getAttribute("data-y")) * 900 * S.scale;
        var lx = Math.min(Math.max(col, ax + 36), cw - (cw < 700 ? 132 : 230));
        c.style.transform = "translate3d(" + ax.toFixed(1) + "px," + ay.toFixed(1) + "px,0)";
        c.querySelector(".lead").style.width = (lx - ax).toFixed(1) + "px";
      }
    },
    onPaint:function(S, pos){
      meter.style.transform = "scaleX(" + (pos / S.TOTAL).toFixed(4) + ")";
      // The held last frame dissolves into midnight as the time section arrives: no panel lifts over it
      var f = ramp(pos, S.TOTAL - 70, S.TOTAL).toFixed(3);
      if (f !== heroFade._f){ heroFade._f = f; heroFade.style.opacity = f; }
    }
  });

  /* ============================ CHAPTER 2 ============================ */
  // 641 frames, 1440x810: gears 0..96 · gear-to-watch reveal 97..182 (side bars cut away)
  //   front pose 183..274 · night, lume 275..399 · your box transition 400..520 · descent 521..640
  var s2el = document.getElementById("inside");
  var sweeps = [].map.call(s2el.querySelectorAll(".sweep"), function(el){
    return { el:el, hand:el.querySelector(".hand"), copy:el.querySelector(".sweep-copy"), key:"" };
  });
  function wedge(a0, a1){                       // clockwise from twelve, degrees; big radius covers corners
    var pts = ["50% 50%"];
    for (var a = a0; a < a1; a += 6) pts.push(pt(a));
    pts.push(pt(a1));
    return "polygon(" + pts.join(",") + ")";
    function pt(d){ var r = d * Math.PI / 180; return (50 + 150 * Math.sin(r)).toFixed(2) + "% " + (50 - 150 * Math.cos(r)).toFixed(2) + "%"; }
  }
  function paintSweep(w, pos, si, so){
    var c = ramp(pos, si.start + 4, si.end - 10), o = ramp(pos, so.start + 10, so.end - 4);
    var key = c.toFixed(4) + "|" + o.toFixed(4);
    if (key === w.key) return; w.key = key;
    if (c <= 0 || o >= 1){ w.el.style.visibility = "hidden"; return; }
    w.el.style.visibility = "visible";
    var edge;
    if (o > 0){ edge = 360 * o; w.el.style.clipPath = wedge(edge, 360); }
    else if (c < 1){ edge = 360 * c; w.el.style.clipPath = wedge(0, edge); }
    else { edge = 0; w.el.style.clipPath = "none"; }
    var sweeping = (c < 1) || (o > 0);
    w.hand.style.opacity = sweeping ? 1 : 0;
    w.hand.style.transform = "rotate(" + edge.toFixed(2) + "deg)";
    w.copy.style.opacity = (clamp((c - .7) / .3, 0, 1) * (1 - clamp(o / .35, 0, 1))).toFixed(3);
  }
  var ch2 = Scrub({
    count:641, IW:1440, IH:810,
    src:function(i){ return "frames2/f" + String(i + 1).padStart(4, "0") + ".webp"; },
    canvas:document.getElementById("cv2"), track:s2el,
    beatsRoot:s2el.querySelector(".beats2"), top:function(){ return s2el.offsetTop; },
    segs:[
      { hold:0,   len:40 },
      { from:0,   to:60,  len:90,  ease:"in" },
      { hold:60,  len:150, name:"gears", focus:[0.5, 0.5] },
      { from:60,  to:182, len:190, ease:"inout" },
      { hold:182, len:80,  name:"doorsIn" },          // doors close over the last clean reveal frame
      { hold:183, len:80,  name:"doorsOut" },         // ...and open on the front pose
      { from:183, to:399, len:240, ease:"inout" },
      { hold:399, len:150, name:"night", focus:[0.5, 0.5] },
      { hold:399, len:80,  name:"curtainIn" },        // the panel rises over the lume...
      { hold:400, len:80,  name:"curtainOut" },       // ...and lifts off the lit watch
      { from:400, to:640, len:260, ease:"inout" },
      { hold:640, len:140, name:"box", focus:[0.5, 0.55] }
    ],
    beatSpec:function(S){
      var g = S.seg("gears"), n = S.seg("night"), b = S.seg("box");
      return [
        { a:g.start + 6, b:g.end - 6 },
        { a:S.P(150),    b:S.seg("doorsIn").start - 4 },
        { a:n.start + 6, b:n.end - 2 },
        { a:b.start + 6, b:Infinity, last:true }
      ];
    },
    onPaint:function(S, pos){
      // Seam covers: a coloured field sweeps clockwise from twelve like a seconds hand, holds
      // one line of copy while the frame index jumps underneath, then sweeps on round and off.
      paintSweep(sweeps[0], pos, S.seg("doorsIn"), S.seg("doorsOut"));
      paintSweep(sweeps[1], pos, S.seg("curtainIn"), S.seg("curtainOut"));
    }
  });
  window.__batto = { hero:hero, ch2:ch2 };

  /* ============================ LOOP / BOOT ============================ */
  var scrubs = [hero, ch2], meter = document.getElementById("meter");
  var boot = document.getElementById("boot"), bootRate = document.getElementById("bootRate"), bootPct = document.getElementById("bootPct");
  var started = false, introStart = 0, lastT = 0, introK = 0, READY_AT = 0.2;
  function layout(){
    cw = innerWidth; ch = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
    unit = (probe.offsetHeight || ch) / 100;
    scrubs.forEach(function(s){ s.layout(); });
  }
  function readAll(){ scrubs.forEach(function(s){ s.read(); }); }
  function start(){
    if (started) return; started = true;
    bootRate.textContent = "+0.0 s/d"; bootPct.textContent = "Ready";
    boot.classList.add("done");
    readAll(); scrubs.forEach(function(s){ s.shown = s.target; });
    introStart = performance.now() + 250;
    setTimeout(function(){ ch2.load(); }, 1500);   // chapter 2 fills in behind the hero
  }
  hero.load(function(S){
    if (started){ if (S.done === S.o.count) ch2.load(); return; }
    var p = Math.min(1, S.done / (S.o.count * READY_AT));
    bootRate.textContent = "+" + (14.8 * (1 - p)).toFixed(1) + " s/d";
    bootPct.textContent = Math.round(p * 100) + "%";
    if (p >= 1) start();
  });
  function tick(now){
    var dt = lastT ? Math.min(100, now - lastT) : 16.667; lastT = now;
    if (started) introK = reduce ? 1 : clamp((now - introStart) / 1400, 0, 1);
    scrubs.forEach(function(s){ s.tick(dt, introK); });
    extras.forEach(function(f){ f(dt, now); });
    requestAnimationFrame(tick);
  }
  addEventListener("scroll", function(){
    readAll();
    if (!ch2.loading && ch2.visible()) ch2.load();     // someone jumped straight down: load now
  }, { passive:true });
  addEventListener("resize", function(){ layout(); readAll(); });
  layout(); readAll();
  setTimeout(start, 15000);
  requestAnimationFrame(tick);


  /* ======================= LOWER SECTIONS ======================= */
  function pad(n){ return (n < 10 ? "0" : "") + n; }
  var io = "IntersectionObserver" in window ? function(el, fn, margin){
    var o = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting){ o.unobserve(e.target); fn(e.target); } }); }, { rootMargin: margin || "0px 0px -15% 0px" });
    o.observe(el);
  } : function(el, fn){ fn(el); };

  // Headings with the width axis: they settle from wide to set width once, on arrival
  [].forEach.call(document.querySelectorAll(".wdth-in"), function(h){
    if (reduce) return;
    h.classList.add("wide");
    io(h, function(el){ requestAnimationFrame(function(){ el.classList.remove("wide"); }); });
  });

  // Odometer: each digit is a 0-9 column moved by translateY; higher columns carry later
  function Odo(el){
    var cols = [];
    function ensure(n){
      while (cols.length < n){
        var c = document.createElement("span"); c.className = "odo-col";
        var s = document.createElement("span"); s.className = "odo-strip"; s.textContent = "0123456789";
        c.appendChild(s); el.insertBefore(c, el.firstChild); cols.unshift(s);
      }
    }
    return function(v){
      var str = String(Math.max(0, Math.floor(v))); ensure(str.length);
      var off = cols.length - str.length;
      for (var i = 0; i < cols.length; i++){
        var d = i < off ? 0 : +str[i - off];
        cols[i].style.transform = "translate3d(0," + (-d * 10) + "%,0)";
        cols[i].parentNode.style.display = (i < off) ? "none" : "";
        cols[i].style.transitionDelay = ((cols.length - 1 - i) * 40) + "ms";
      }
      el.setAttribute("aria-label", str);
    };
  }
  // Live beats since arrival: 8 per second, like the 28,800 vph balance
  var t0 = performance.now(), beatSet = Odo(document.getElementById("beatOdo")), lastBeat = -1;
  extras.push(function(dt, now){
    var b = Math.floor((now - t0) / 125);
    if (b !== lastBeat){ lastBeat = b; beatSet(b); }
  });
  // Fixed figures roll up to their value once, on arrival
  [].forEach.call(document.querySelectorAll(".figs .odo"), function(el){
    var set = Odo(el), to = +el.getAttribute("data-to");
    set(reduce ? to : 0);
    io(el, function(){ setTimeout(function(){ set(to); }, 120); });
  });

  // Clocks: the visitor's time and the boutique's, written only when the second changes
  var lt = document.getElementById("localTime"), cl = document.getElementById("clkLocal"), cj = document.getElementById("clkJhb"), lastSec = -1;
  var jhb = window.Intl ? new Intl.DateTimeFormat("en-GB", { timeZone:"Africa/Johannesburg", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }) : null;
  function clocks(){
    var d = new Date(), s = d.getSeconds(); if (s === lastSec) return; lastSec = s;
    lt.textContent = pad(d.getHours()) + ":" + pad(d.getMinutes());
    lt.setAttribute("datetime", d.toISOString());
    cl.textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(s);
    cj.textContent = jhb ? jhb.format(d) : cl.textContent;
  }
  clocks(); setInterval(clocks, 250);

  // The line: four dials on a ring. Scroll turns the ring so the active dial sits at twelve,
  // dials counter-rotate to stay upright, and the ground cross-fades to that dial's colour.
  var line = document.getElementById("line"), ring = document.getElementById("ring");
  var dialEls = [].slice.call(ring.querySelectorAll(".dialw")), picks = [].slice.call(line.querySelectorAll(".pick"));
  var arc = ring.querySelector(".ring-arc"), ringTrack = ring.querySelector(".ring-track");
  var MODELS = [
    { ref:"BT-01", name:"Midnight on gold",       spec:"Yellow gold · midnight blue",        bg:[15, 30, 61],    light:false },
    { ref:"BT-02", name:"Midnight on steel",      spec:"Steel · midnight blue",              bg:[27, 41, 66],    light:false },
    { ref:"BT-03", name:"Racing green on steel",  spec:"Steel · racing green",               bg:[14, 58, 44],    light:false },
    { ref:"BT-04", name:"White with red counters",spec:"Steel · white, red counters",        bg:[242, 240, 235], light:true }
  ];
  var hubRef = document.getElementById("hubRef"), hubName = document.getElementById("hubName"), hubSpec = document.getElementById("hubSpec");
  var ringShown = 0, ringActive = -1, ringKey = "";
  function ringTarget(){
    var r = line.getBoundingClientRect(), span = Math.max(1, r.height - innerHeight);
    var t = clamp(-r.top / span, 0, 1) * 3, i = Math.min(2, Math.floor(t)), f = t - i;
    return i + smooth(clamp((f - 0.22) / 0.56, 0, 1));            // detents: hold, turn, hold
  }
  extras.push(function(dt){
    var r = line.getBoundingClientRect();
    if (r.bottom < -ch || r.top > ch * 2) return;
    var tgt = ringTarget();
    ringShown = reduce ? tgt : ringShown + (tgt - ringShown) * (1 - Math.pow(1 - .115, dt / 16.667));
    var key = ringShown.toFixed(4) + "|" + cw; if (key === ringKey) return; ringKey = key;
    var R = Math.min(cw * (cw < 700 ? 0.3 : 0.22), ch * 0.22);
    ringTrack.style.width = arc.style.width = (2 * R).toFixed(0) + "px";
    dialEls.forEach(function(el, k){
      var ang = (k - ringShown) * 90, near = Math.max(0, 1 - Math.abs(k - ringShown));
      el.style.transform = "rotate(" + ang + "deg) translate3d(0," + (-R).toFixed(1) + "px,0) rotate(" + (-ang) + "deg) scale(" + (0.6 + 0.4 * near).toFixed(3) + ")";
      el.style.opacity = (0.45 + 0.55 * near).toFixed(3);
      el.style.zIndex = near > .5 ? 2 : 1;
    });
    arc.style.transform = "rotate(" + (-ringShown * 90) + "deg)";   // the ticked bezel turns with the ring
    var lo = Math.floor(ringShown), hi = Math.min(3, lo + 1), f = ringShown - lo, A = MODELS[lo].bg, B = MODELS[hi].bg;
    line.style.backgroundColor = "rgb(" + [0, 1, 2].map(function(j){ return Math.round(A[j] + (B[j] - A[j]) * f); }).join(",") + ")";
    var act = Math.round(ringShown);
    if (act !== ringActive){
      ringActive = act; var M = MODELS[act];
      hubRef.textContent = M.ref; hubName.textContent = M.name; hubSpec.textContent = M.spec;
      line.classList.toggle("on-light", M.light);
      picks.forEach(function(b, k){ b.setAttribute("aria-pressed", k === act); });
    }
  });
  picks.forEach(function(b){                 // jump the scroll to that dial's detent
    b.addEventListener("click", function(){
      var k = +b.getAttribute("data-i"), r = line.getBoundingClientRect(), span = r.height - innerHeight;
      scrollTo({ top: pageYOffset + r.top + span * (k / 3), behavior: "auto" });   // the page lerp already eases the jump
    });
  });

  // Header reads on whatever chapter sits under it: ink on paper, paper on everything else
  var topBar = document.querySelector(".top"), lights = [document.getElementById("numbers"), line], topLight = null;
  extras.push(function(){
    var y = 34, on = false;
    for (var i = 0; i < lights.length; i++){
      var r = lights[i].getBoundingClientRect();
      if (r.top <= y && r.bottom >= y && (lights[i] !== line || line.classList.contains("on-light"))) on = true;
    }
    if (on !== topLight){ topLight = on; topBar.classList.toggle("on-light", on); }
  });

  // Fitting: day chips plus a tick rail that magnifies toward the pointer like a dock
  var dayRow = document.getElementById("dayRow"), rail = document.getElementById("rail"), slotRead = document.getElementById("slotRead");
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var pickDay = null, pickTime = null, d0 = new Date();
  for (var k = 1, made = 0; made < 5; k++){
    var d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k);
    if (d.getDay() === 0) continue;             // boutique closed on Sunday
    var b = document.createElement("button"); b.type = "button"; b.className = "day";
    b.innerHTML = "<span>" + DAYS[d.getDay()] + "</span><b>" + d.getDate() + "</b>";
    b.setAttribute("aria-pressed", made === 0); b._label = DAYS[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()];
    if (made === 0) pickDay = b._label;
    b.addEventListener("click", function(){ [].forEach.call(dayRow.children, function(x){ x.setAttribute("aria-pressed", x === this); }, this); pickDay = this._label; readSlot(); });
    dayRow.appendChild(b); made++;
  }
  var ticks = [];
  for (var m = 10 * 60; m <= 18 * 60; m += 30){
    var tk = document.createElement("button"); tk.type = "button"; tk.className = "tick" + (m % 60 ? "" : " hour");
    tk.setAttribute("role", "radio"); tk.setAttribute("aria-checked", "false");
    tk._label = pad(Math.floor(m / 60)) + ":" + pad(m % 60); tk.setAttribute("aria-label", tk._label);
    tk.innerHTML = "<i></i>" + (m % 60 ? "" : "<span>" + Math.floor(m / 60) + "</span>");
    rail.appendChild(tk); ticks.push(tk);
  }
  function choose(tk){
    ticks.forEach(function(x){ var on = x === tk; x.setAttribute("aria-checked", on); x.tabIndex = on ? 0 : -1; x.classList.toggle("on", on); });
    pickTime = tk._label; readSlot();
  }
  ticks.forEach(function(tk, i){
    tk.tabIndex = i === 0 ? 0 : -1;
    tk.addEventListener("click", function(){ choose(tk); });
    tk.addEventListener("keydown", function(e){
      var j = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : -1;
      if (j < 0 || j >= ticks.length) return; e.preventDefault(); ticks[j].focus(); choose(ticks[j]);
    });
  });
  function readSlot(){ slotRead.textContent = pickTime ? pickDay + " · " + pickTime : "Choose a time"; }
  // Dock magnification: gaussian falloff around the pointer, each tick eased toward its target
  var mag = ticks.map(function(){ return 1; }), magT = ticks.map(function(){ return 1; }), magKey = "";
  if (!reduce && matchMedia("(hover: hover) and (pointer: fine)").matches){
    rail.addEventListener("pointermove", function(e){
      ticks.forEach(function(tk, i){ var r = tk.getBoundingClientRect(), dx = (e.clientX - (r.left + r.width / 2)) / (r.width * 2.2); magT[i] = 1 + 1.4 * Math.exp(-dx * dx); });
    });
    rail.addEventListener("pointerleave", function(){ magT = magT.map(function(){ return 1; }); });
    extras.push(function(dt){
      var k = 1 - Math.pow(1 - .2, dt / 16.667), s = "";
      for (var i = 0; i < ticks.length; i++){ mag[i] += (magT[i] - mag[i]) * k; s += mag[i].toFixed(3); }
      if (s === magKey) return; magKey = s;
      ticks.forEach(function(tk, i){ tk.firstChild.style.transform = "scaleY(" + mag[i].toFixed(3) + ")"; });
    });
  }

  var form = document.getElementById("fitForm"), note = document.getElementById("formNote");
  form.addEventListener("submit", function(ev){
    ev.preventDefault();
    if (!pickTime){ note.textContent = "Pick a time on the rail first."; ticks[0].focus(); return; }
    var bad = null;
    [].forEach.call(form.querySelectorAll("[required]"), function(f){
      var ok = f.value.trim() && (f.type !== "email" || /.+@.+\..+/.test(f.value));
      f.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok && !bad) bad = f;
    });
    if (bad){ note.textContent = "Please add your " + bad.name + "."; bad.focus(); return; }
    note.textContent = "Held for you: " + pickDay + " at " + pickTime + ". This demo build doesn't send requests yet.";
  });
})();
