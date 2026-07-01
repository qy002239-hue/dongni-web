export default function WelcomePage({ onStart, onGoogleLogin }) {
  return (
    <main className="auth-screen welcome-screen">
      <div className="welcome-bg-glow" aria-hidden="true" />
      <section className="welcome-panel animate-fade-in">
        <div className="welcome-main">
          <div className="welcome-content">
            <div className="welcome-brand" aria-label="懂妳 Logo 與名稱">
              <div className="welcome-logo-mark" aria-hidden="true" />
              <div className="welcome-heading-group">
                <div className="welcome-app-name">懂妳</div>
                <div className="welcome-presence" aria-label="懂妳目前在線">
                  <span className="welcome-presence-dot" aria-hidden="true" />
                  <span className="welcome-presence-text">懂妳在這裡，聽妳說</span>
                </div>
              </div>
            </div>

            <h1 className="welcome-tagline">一個安靜、私密且穩定的情緒陪伴空間</h1>
            <p className="welcome-intro">
              不需要準備好答案，也不用勉強自己振作。先登入，慢慢把想說的話說出來，讓對話自然開始。
            </p>

            <div className="welcome-actions">
              <button onClick={onGoogleLogin} className="auth-primary" type="button">
                使用 Google 登入
              </button>
              <button onClick={onStart} className="auth-secondary" type="button">
                先看看這裡
              </button>
            </div>
          </div>

          <div className="welcome-highlights" aria-label="懂妳的四個特色">
            <article className="welcome-feature-card">
              <span className="welcome-feature-icon" aria-hidden="true">🌿</span>
              <h2>陪伴</h2>
              <p>不用急著振作，也不用急著找到答案。</p>
            </article>
            <article className="welcome-feature-card">
              <span className="welcome-feature-icon" aria-hidden="true">🌊</span>
              <h2>傾聽</h2>
              <p>你可以慢慢說，我會一直在。</p>
            </article>
            <article className="welcome-feature-card">
              <span className="welcome-feature-icon" aria-hidden="true">🤍</span>
              <h2>接住</h2>
              <p>不評價，不說教，不否定。</p>
            </article>
            <article className="welcome-feature-card">
              <span className="welcome-feature-icon" aria-hidden="true">🔒</span>
              <h2>安心</h2>
              <p>你的對話內容只屬於你，保有專屬的私密感。</p>
            </article>
          </div>
        </div>

        <p className="welcome-footer-note">你不需要準備好任何事，只要你在。</p>
      </section>
    </main>
  );
}
