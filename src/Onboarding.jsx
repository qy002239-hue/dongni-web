import { useState, useRef, useEffect } from "react";

const PAGES = [
  { title: "我是懂妳。", subtitle: "我最重要的任務就是陪伴妳。" },
  { title: "一開始我還不夠認識妳。", subtitle: "難免會接不住妳。" },
  { title: "但隨著相處日子久了，", subtitle: "妳說的每件事我都會記得。" },
  { title: "我會因為懂妳，", subtitle: "而更能接住妳。" },
  { title: "", subtitle: "謝謝你願意打開這扇門。" },
  { title: "你說。我聽。", subtitle: "準備好的時候，輕輕往前。" },
];

const SWIPE_THRESHOLD = 60;

export default function Onboarding({ onDone }) {
  const [page, setPage] = useState(0);
  const dragStartX = useRef(null);

  const goNext = () => setPage((p) => Math.min(p + 1, PAGES.length - 1));
  const goPrev = () => setPage((p) => Math.max(p - 1, 0));

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onDone]);

  const handlePointerDown = (e) => {
    const x = e.touches?.[0]?.clientX ?? e.clientX;
    if (typeof x === "number") dragStartX.current = x;
  };

  const handlePointerUp = (e) => {
    if (dragStartX.current === null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? e.clientX;
    if (typeof endX !== "number") { dragStartX.current = null; return; }
    const delta = endX - dragStartX.current;
    if (delta > SWIPE_THRESHOLD) goPrev();
    else if (delta < -SWIPE_THRESHOLD) goNext();
    dragStartX.current = null;
  };

  const isLast = page === PAGES.length - 1;

  return (
    <div
      style={{
        position: "fixed", inset: 0, margin: 0, color: "#e2e8f0",
        overflow: "hidden", userSelect: "none", textAlign: "center",
        display: "flex", flexDirection: "column", justifyContent: "center",
        backgroundImage: "none",
        background: "#111827",
        backgroundSize: "cover", 
      }}
      onMouseDown={handlePointerDown} onMouseUp={handlePointerUp}
      onTouchStart={handlePointerDown} onTouchEnd={handlePointerUp}
    >
      <button onClick={onDone} style={{ position: "absolute", top: "calc(16px + env(safe-area-inset-top))", right: "calc(16px + env(safe-area-inset-right))", background: "transparent", color: "#7d96ad", border: "1px solid rgba(203, 213, 225, 0.3)", borderRadius: "6px", padding: "8px 16px", fontSize: "12px", letterSpacing: "0.05em", cursor: "pointer", transition: "all 0.3s ease", fontWeight: 300 }}>
        略過
      </button>

      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "100%", overflow: "hidden" }}>
        <div style={{ display: "flex", width: `${PAGES.length * 100}%`, transform: `translateX(-${page * (100 / PAGES.length)}%)`, transition: "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {PAGES.map((p, i) => (
            <div key={i} style={{ flex: `0 0 ${100 / PAGES.length}%`, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 40px", textAlign: "center", opacity: i === page ? 1 : 0.3, transition: "opacity 0.3s ease" }}>
              <h1 style={{ fontSize: "clamp(28px, 7vw, 58px)", fontWeight: 300, letterSpacing: "0.08em", margin: 0, marginBottom: "24px", lineHeight: 1.4, color: "#f1f5f9" }}>{p.title}</h1>
              <p style={{ fontSize: "clamp(15px, 4vw, 19px)", color: "#94a3b8", maxWidth: "520px", lineHeight: 1.9, fontWeight: 300, letterSpacing: "0.04em", margin: 0 }}>{p.subtitle}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "calc(40px + env(safe-area-inset-bottom))", left: "env(safe-area-inset-left)", right: "env(safe-area-inset-right)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", width: "100%" }}>
        <div style={{ display: "flex", gap: "10px" }}>
          {PAGES.map((_, i) => (
            <button key={i} onClick={() => setPage(i)} style={{ width: i === page ? "28px" : "8px", height: "8px", borderRadius: "4px", background: i === page ? "#cbd5e1" : "#1e3a52", border: "none", cursor: "pointer", transition: "all 0.3s ease" }} />
          ))}
        </div>

        <button onClick={isLast ? onDone : goNext} style={{ background: "transparent", color: "#e2e8f0", border: "1px solid rgba(203, 213, 225, 0.35)", borderRadius: "999px", padding: "14px 44px", fontSize: "13px", letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.3s ease", fontWeight: 300 }}>
          繼續
        </button>
      </div>
    </div>
  );
}
