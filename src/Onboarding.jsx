import { useEffect, useRef, useState } from 'react';

const PAGES = [
  {
    title: '嗨，我是懂妳',
    subtitle: '這裡不是要妳立刻變好，而是先讓妳不用一個人撐著。'
  },
  {
    title: '妳可以慢慢說',
    subtitle: '委屈、混亂、說不出口的念頭，都可以先放在這裡。'
  },
  {
    title: '我會聽見重點',
    subtitle: '我會陪妳整理情緒背後真正卡住的地方，而不是只給妳空泛安慰。'
  },
  {
    title: '這是一個安靜的空間',
    subtitle: '每次對話會在閒置 30 分鐘後結束，讓妳可以重新開始。'
  },
  {
    title: '準備好了就進來',
    subtitle: '先看完重要聲明，再用 Google 登入，就能開始和懂妳說話。'
  }
];

const SWIPE_THRESHOLD = 60;

export default function Onboarding({ onDone, onPricing }) {
  const [page, setPage] = useState(0);
  const dragStartX = useRef(null);

  const goNext = () => setPage((current) => Math.min(current + 1, PAGES.length - 1));
  const goPrev = () => setPage((current) => Math.max(current - 1, 0));

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === 'Escape') onDone();
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onDone]);

  const handlePointerDown = (event) => {
    const x = event.touches?.[0]?.clientX ?? event.clientX;
    if (typeof x === 'number') dragStartX.current = x;
  };

  const handlePointerUp = (event) => {
    if (dragStartX.current === null) return;

    const endX = event.changedTouches?.[0]?.clientX ?? event.clientX;
    if (typeof endX !== 'number') {
      dragStartX.current = null;
      return;
    }

    const delta = endX - dragStartX.current;
    if (delta > SWIPE_THRESHOLD) goPrev();
    if (delta < -SWIPE_THRESHOLD) goNext();
    dragStartX.current = null;
  };

  const isLast = page === PAGES.length - 1;

  return (
    <main
      className="onboarding-screen"
      onMouseDown={handlePointerDown}
      onMouseUp={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchEnd={handlePointerUp}
    >
      <div className="onboarding-top-actions">
        {onPricing ? (
          <button className="onboarding-link" type="button" onClick={onPricing}>
            Plus 方案
          </button>
        ) : <span />}
        <button className="onboarding-link" type="button" onClick={onDone}>
          略過
        </button>
      </div>

      <section className="onboarding-stage" aria-live="polite">
        <div
          className="onboarding-track"
          style={{
            width: `${PAGES.length * 100}%`,
            transform: `translateX(-${page * (100 / PAGES.length)}%)`
          }}
        >
          {PAGES.map((item, index) => (
            <article
              className="onboarding-panel"
              key={item.title}
              style={{ flexBasis: `${100 / PAGES.length}%` }}
              aria-hidden={index !== page}
            >
              <h1>{item.title}</h1>
              <p>{item.subtitle}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="onboarding-controls">
        <div className="onboarding-dots" aria-label="歡迎頁進度">
          {PAGES.map((item, index) => (
            <button
              aria-label={`第 ${index + 1} 頁：${item.title}`}
              aria-current={index === page ? 'step' : undefined}
              className={index === page ? 'onboarding-dot onboarding-dot-active' : 'onboarding-dot'}
              key={item.title}
              type="button"
              onClick={() => setPage(index)}
            />
          ))}
        </div>

        <button className="onboarding-primary" type="button" onClick={isLast ? onDone : goNext}>
          {isLast ? '進入懂妳' : '下一頁'}
        </button>
      </div>
    </main>
  );
}
