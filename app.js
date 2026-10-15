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
    onPaint:function(S, pos){ meter.style.transform = "scaleX(" + (pos / S.TOTAL).toFixed(4) + ")"; }
  });

  /* ============================ CHAPTER 2 ============================ */
  // 641 frames, 1440x810: gears 0..96 · gear-to-watch reveal 97..182 (side bars cut away)
  //   front pose 183..274 · night, lume 275..399 · your box transition 400..520 · descent 521..640
  var s2el = document.getElementById("inside");
  var doors = s2el.querySelectorAll(".door"), doorCopy = s2el.querySelector(".doors-copy");
  var curtain = s2el.querySelector(".curtain"), curtainIn = curtain.querySelector(".curtain-in");
  var cover = { d:-1, c:-1 };
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
      // Doors: two halves close from the sides, copy sits on the seam, then they part again
      var di = S.seg("doorsIn"), dO = S.seg("doorsOut");
      var d = ramp(pos, di.start + 4, di.end - 10) * (1 - ramp(pos, dO.start + 10, dO.end - 4));
      if (d !== cover.d){
        cover.d = d;
        doors[0].style.transform = "translate3d(" + (-(1 - d) * 101).toFixed(2) + "%,0,0)";
        doors[1].style.transform = "translate3d(" + ((1 - d) * 101).toFixed(2) + "%,0,0)";
        doorCopy.style.opacity = clamp((d - .6) / .4, 0, 1).toFixed(3);
        s2el.querySelector(".doors").style.visibility = d > 0 ? "visible" : "hidden";
      }
      // Curtain: a panel rises from below, holds with copy, then lifts away upward
      var ci = S.seg("curtainIn"), cO = S.seg("curtainOut");
      var up = ramp(pos, ci.start + 4, ci.end - 10), off = ramp(pos, cO.start + 10, cO.end - 4);
      var c = up * 10 + off;                       // encodes both phases for the change check
      if (c !== cover.c){
        cover.c = c;
        curtain.style.transform = "translate3d(0," + ((1 - up) * 101 - off * 101).toFixed(2) + "%,0)";
        curtainIn.style.opacity = clamp((up - .5) / .5, 0, 1) * (1 - clamp(off / .5, 0, 1));
        curtain.style.visibility = (up > 0 && off < 1) ? "visible" : "hidden";
      }
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

  /* ======================= LOWER SECTIONS (one-shot reveals) ======================= */
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function(list){
    list.forEach(function(en){ if (en.isIntersecting){ io.unobserve(en.target); en.target._fire(en.target); } });
  }, { rootMargin: "0px 0px -18% 0px" }) : null;
  function watch(el, fn){ el._fire = fn; if (io && !reduce) io.observe(el); else fn(el); }

  [].forEach.call(document.querySelectorAll(".sheet h2"), function(h){
    h.classList.add("rv"); watch(h, function(el){ el.classList.add("in"); });
  });
  [].forEach.call(document.querySelectorAll(".sheet h2 ~ p, .cert-copy p"), function(p){
    if (reduce) return;
    p.style.opacity = 0;
    watch(p, function(el){ el.animate([{ opacity:0 }, { opacity:1 }], { duration:900, delay:160, easing:"cubic-bezier(0.23,1,0.32,1)", fill:"forwards" }); });
  });

  // Timing trace: a pen rides the tip of the line as it draws, then the readings count up
  var path = document.getElementById("tracePath"), pen = document.getElementById("tracePen");
  if (path){
    var L = path.getTotalLength(), dds = [].slice.call(document.querySelectorAll(".read dd"));
    if (!reduce){ path.style.strokeDasharray = L; path.style.strokeDashoffset = L; pen.style.opacity = 0; }
    watch(document.querySelector(".sheet-card"), function(){
      if (reduce) return;
      var t0 = performance.now();
      pen.style.opacity = 1;
      (function step(now){
        var t = clamp((now - t0) / 2400, 0, 1), d = L * t, pt = path.getPointAtLength(d);
        path.style.strokeDashoffset = L - d;
        pen.setAttribute("cx", pt.x); pen.setAttribute("cy", pt.y);
        if (t < 1) requestAnimationFrame(step);
      })(t0);
      dds.forEach(function(dd, k){
        var m = dd.textContent.match(/^([+]?)([\d.]+)(.*)$/); if (!m) return;
        var end = parseFloat(m[2]), dec = (m[2].split(".")[1] || "").length, c0 = performance.now() + 300 + k * 120;
        (function count(now){
          var t = clamp((now - c0) / 1100, 0, 1);
          dd.textContent = m[1] + (end * ease(t, "out")).toFixed(dec) + m[3];
          if (t < 1) requestAnimationFrame(count);
        })(c0);
      });
    });
  }

  // Catalogue: viewfinder marks close in on the featured dial, then the watch snaps into the frame.
  // Picking a reference swaps the featured watch; the marks re-close on the new one.
  var main = document.querySelector(".slot.main");
  if (main){
    var marks = [].slice.call(main.querySelectorAll(".crop i")), img = main.querySelector(".shot img");
    var cap = main.querySelector("figcaption"), rows = [].slice.call(document.querySelectorAll(".refs tbody tr"));
    function frameIn(){
      if (reduce) return;
      var off = [[-60,-60],[60,-60],[-60,60],[60,60]];
      marks.forEach(function(m, k){
        m.animate([{ transform:"translate(" + off[k][0] + "px," + off[k][1] + "px)", opacity:0 },
                   { transform:"translate(0,0)", opacity:1 }], { duration:700, easing:"cubic-bezier(0.32,0.72,0,1)", fill:"both" });
      });
      img.animate([{ opacity:0, transform:"scale(1.08)" }, { opacity:1, transform:"scale(1.01)", offset:.9 }, { opacity:1, transform:"scale(1)" }],
        { duration:900, delay:300, easing:"cubic-bezier(0.23,1,0.32,1)", fill:"both" });
    }
    if (!reduce) img.style.opacity = 0;
    watch(main, frameIn);
    function pick(ref){
      var row = rows.filter(function(r){ return r.getAttribute("data-ref") === ref; })[0]; if (!row) return;
      rows.forEach(function(r){ var on = r === row; r.classList.toggle("on", on); r.querySelector("button").setAttribute("aria-pressed", on); });
      img.src = row.getAttribute("data-img"); img.alt = row.getAttribute("data-alt");
      cap.innerHTML = "<b>" + row.getAttribute("data-name") + "</b><span>" + ref + "</span>";
      frameIn();
    }
    rows.forEach(function(r){ r.querySelector("button").addEventListener("click", function(){ pick(r.getAttribute("data-ref")); }); });
    [].forEach.call(document.querySelectorAll(".slot.side"), function(s){
      s.addEventListener("click", function(){ pick(s.getAttribute("data-ref")); });
    });
    rows.forEach(function(tr, k){
      if (reduce) return;
      tr.style.opacity = 0;
      watch(tr, function(el){ el.animate([{ opacity:0 }, { opacity:1 }], { duration:500, delay:k * 60, easing:"ease-out", fill:"forwards" }); });
    });
  }

  // Fitting form: honest about the demo, errors next to the field
  var form = document.getElementById("fitForm"), note = document.getElementById("formNote");
  if (form) form.addEventListener("submit", function(ev){
    ev.preventDefault();
    var bad = null;
    [].forEach.call(form.querySelectorAll("[required]"), function(f){
      var ok = f.value.trim() && (f.type !== "email" || /.+@.+\..+/.test(f.value));
      f.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok && !bad) bad = f;
    });
    if (bad){ note.textContent = "Please add your " + bad.name + "."; bad.focus(); return; }
    note.textContent = "Thank you, " + form.elements.name.value.trim().split(" ")[0] + ". This demo build doesn't send requests yet.";
  });
})();
